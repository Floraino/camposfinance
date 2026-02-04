-- Tabela para auditoria de eventos de autenticação
CREATE TABLE public.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('login_success', 'login_failed', 'logout', 'password_reset_requested', 'password_reset_completed', 'password_changed', 'session_revoked', 'account_locked', 'account_unlocked')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX idx_auth_events_user_id ON public.auth_events(user_id);
CREATE INDEX idx_auth_events_email ON public.auth_events(email);
CREATE INDEX idx_auth_events_ip_address ON public.auth_events(ip_address);
CREATE INDEX idx_auth_events_created_at ON public.auth_events(created_at DESC);
CREATE INDEX idx_auth_events_event_type ON public.auth_events(event_type);

-- Tabela para rate limiting de login
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- pode ser email ou IP
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'ip')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas
CREATE UNIQUE INDEX idx_login_attempts_identifier ON public.login_attempts(identifier, identifier_type);
CREATE INDEX idx_login_attempts_locked_until ON public.login_attempts(locked_until) WHERE locked_until IS NOT NULL;

-- Habilitar RLS
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Políticas para auth_events: apenas o próprio usuário pode ver seus eventos
CREATE POLICY "Users can view their own auth events"
ON public.auth_events
FOR SELECT
USING (auth.uid() = user_id);

-- Políticas para login_attempts: apenas super admins podem visualizar
CREATE POLICY "Only super admins can view login attempts"
ON public.login_attempts
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Função para registrar evento de auth (usada por edge functions)
CREATE OR REPLACE FUNCTION public.log_auth_event(
  _event_type TEXT,
  _user_id UUID DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _ip_address TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL,
  _device_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO public.auth_events (
    event_type,
    user_id,
    email,
    ip_address,
    user_agent,
    device_id,
    metadata
  ) VALUES (
    _event_type,
    _user_id,
    _email,
    _ip_address,
    _user_agent,
    _device_id,
    _metadata
  )
  RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$;

-- Função para verificar rate limit
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(
  _identifier TEXT,
  _identifier_type TEXT,
  _max_attempts INTEGER DEFAULT 5,
  _window_minutes INTEGER DEFAULT 10,
  _lockout_minutes INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempt_record RECORD;
  result JSONB;
  window_start TIMESTAMPTZ;
BEGIN
  window_start := now() - (_window_minutes || ' minutes')::INTERVAL;
  
  -- Buscar registro existente
  SELECT * INTO attempt_record
  FROM public.login_attempts
  WHERE identifier = _identifier AND identifier_type = _identifier_type;
  
  -- Se existe e está bloqueado
  IF attempt_record IS NOT NULL AND attempt_record.locked_until IS NOT NULL THEN
    IF attempt_record.locked_until > now() THEN
      -- Ainda bloqueado
      RETURN jsonb_build_object(
        'allowed', false,
        'locked', true,
        'locked_until', attempt_record.locked_until,
        'remaining_seconds', EXTRACT(EPOCH FROM (attempt_record.locked_until - now()))::INTEGER
      );
    ELSE
      -- Lockout expirou, resetar
      UPDATE public.login_attempts
      SET attempt_count = 1,
          first_attempt_at = now(),
          last_attempt_at = now(),
          locked_until = NULL
      WHERE identifier = _identifier AND identifier_type = _identifier_type;
      
      RETURN jsonb_build_object(
        'allowed', true,
        'locked', false,
        'attempts_remaining', _max_attempts - 1
      );
    END IF;
  END IF;
  
  -- Se existe registro
  IF attempt_record IS NOT NULL THEN
    -- Se está dentro da janela de tempo
    IF attempt_record.first_attempt_at > window_start THEN
      -- Incrementar tentativas
      IF attempt_record.attempt_count >= _max_attempts THEN
        -- Bloquear
        UPDATE public.login_attempts
        SET locked_until = now() + (_lockout_minutes || ' minutes')::INTERVAL,
            last_attempt_at = now()
        WHERE identifier = _identifier AND identifier_type = _identifier_type;
        
        RETURN jsonb_build_object(
          'allowed', false,
          'locked', true,
          'locked_until', now() + (_lockout_minutes || ' minutes')::INTERVAL,
          'remaining_seconds', _lockout_minutes * 60
        );
      ELSE
        -- Incrementar contador
        UPDATE public.login_attempts
        SET attempt_count = attempt_count + 1,
            last_attempt_at = now()
        WHERE identifier = _identifier AND identifier_type = _identifier_type;
        
        RETURN jsonb_build_object(
          'allowed', true,
          'locked', false,
          'attempts_remaining', _max_attempts - attempt_record.attempt_count - 1
        );
      END IF;
    ELSE
      -- Janela expirou, resetar contador
      UPDATE public.login_attempts
      SET attempt_count = 1,
          first_attempt_at = now(),
          last_attempt_at = now(),
          locked_until = NULL
      WHERE identifier = _identifier AND identifier_type = _identifier_type;
      
      RETURN jsonb_build_object(
        'allowed', true,
        'locked', false,
        'attempts_remaining', _max_attempts - 1
      );
    END IF;
  ELSE
    -- Primeiro acesso, criar registro
    INSERT INTO public.login_attempts (identifier, identifier_type, attempt_count)
    VALUES (_identifier, _identifier_type, 1);
    
    RETURN jsonb_build_object(
      'allowed', true,
      'locked', false,
      'attempts_remaining', _max_attempts - 1
    );
  END IF;
END;
$$;

-- Função para resetar rate limit após login bem sucedido
CREATE OR REPLACE FUNCTION public.reset_login_rate_limit(
  _identifier TEXT,
  _identifier_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.login_attempts
  WHERE identifier = _identifier AND identifier_type = _identifier_type;
END;
$$;

-- Limpeza automática de tentativas antigas (mais de 24h)
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.login_attempts
  WHERE last_attempt_at < now() - INTERVAL '24 hours';
END;
$$;