import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Mail, Lock, User, Home, Loader2, AlertCircle, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { secureLogin, requestPasswordReset, updatePassword } from "@/services/secureAuthService";
import { validatePassword, getPasswordStrength, emailSchema, signupSchema } from "@/lib/authValidation";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "login" | "signup" | "forgot" | "recovery";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("type") === "recovery" ? "recovery" : "login";
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handle lockout countdown
  useEffect(() => {
    if (lockoutSeconds > 0) {
      const timer = setTimeout(() => setLockoutSeconds(lockoutSeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [lockoutSeconds]);

  // Handle password recovery mode
  useEffect(() => {
    if (searchParams.get("type") === "recovery") {
      setMode("recovery");
    }
  }, [searchParams]);

  const passwordErrors = mode === "signup" ? validatePassword(password) : [];
  const passwordStrength = mode === "signup" ? getPasswordStrength(password) : null;

  const handleLogin = async () => {
    // Validate email
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      toast({
        title: "Email inválido",
        description: emailResult.error.errors[0]?.message || "Verifique o email",
        variant: "destructive",
      });
      return;
    }

    const result = await secureLogin(email, password);
    
    if (result.locked && result.remainingSeconds) {
      setLockoutSeconds(result.remainingSeconds);
    }

    if (!result.success) {
      toast({
        title: "Erro ao entrar",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    navigate("/select-household");
  };

  const handleSignup = async () => {
    // Validate all fields
    const validationResult = signupSchema.safeParse({ email, password, displayName });
    
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast({
        title: "Dados inválidos",
        description: firstError?.message || "Verifique os campos",
        variant: "destructive",
      });
      return;
    }

    const { error } = await signUp(email, password, displayName);
    if (error) {
      // Generic error to prevent enumeration
      const message = error.message.includes("already registered")
        ? "Email ou senha inválidos"
        : error.message;
      
      toast({
        title: "Erro ao cadastrar",
        description: message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Cadastro realizado!",
      description: "Verifique seu email para confirmar a conta.",
    });
    setMode("login");
  };

  const handleForgotPassword = async () => {
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      toast({
        title: "Email inválido",
        description: "Digite um email válido",
        variant: "destructive",
      });
      return;
    }

    const result = await requestPasswordReset(email);
    
    toast({
      title: "Email enviado",
      description: result.message || "Se o email estiver cadastrado, você receberá um link.",
    });
    
    setMode("login");
  };

  const handlePasswordRecovery = async () => {
    if (password !== confirmPassword) {
      toast({
        title: "Senhas não coincidem",
        description: "A nova senha e a confirmação devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    if (passwordErrors.length > 0) {
      toast({
        title: "Senha inválida",
        description: passwordErrors[0],
        variant: "destructive",
      });
      return;
    }

    const result = await updatePassword(password);
    
    if (!result.success) {
      toast({
        title: "Erro",
        description: result.error || "Erro ao alterar senha",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Senha alterada!",
      description: "Sua nova senha foi salva com sucesso.",
    });
    
    navigate("/select-household");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLoading || lockoutSeconds > 0) return;
    
    setIsLoading(true);

    try {
      switch (mode) {
        case "login":
          await handleLogin();
          break;
        case "signup":
          await handleSignup();
          break;
        case "forgot":
          await handleForgotPassword();
          break;
        case "recovery":
          await handlePasswordRecovery();
          break;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderPasswordRequirements = () => {
    if (mode !== "signup" && mode !== "recovery") return null;
    if (!password) return null;

    return (
      <div className="space-y-2 text-sm mt-2">
        <div className="flex items-center gap-2">
          {password.length >= 8 ? (
            <Check className="w-4 h-4 text-success" />
          ) : (
            <X className="w-4 h-4 text-muted-foreground" />
          )}
          <span className={password.length >= 8 ? "text-success" : "text-muted-foreground"}>
            Mínimo 8 caracteres
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/[a-zA-Z]/.test(password) ? (
            <Check className="w-4 h-4 text-success" />
          ) : (
            <X className="w-4 h-4 text-muted-foreground" />
          )}
          <span className={/[a-zA-Z]/.test(password) ? "text-success" : "text-muted-foreground"}>
            Pelo menos uma letra
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/[0-9]/.test(password) ? (
            <Check className="w-4 h-4 text-success" />
          ) : (
            <X className="w-4 h-4 text-muted-foreground" />
          )}
          <span className={/[0-9]/.test(password) ? "text-success" : "text-muted-foreground"}>
            Pelo menos um número
          </span>
        </div>
        {passwordStrength && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all bg-${passwordStrength.color}`}
                style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
              />
            </div>
            <span className={`text-xs text-${passwordStrength.color}`}>
              {passwordStrength.label}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderLockoutWarning = () => {
    if (lockoutSeconds <= 0) return null;

    const minutes = Math.floor(lockoutSeconds / 60);
    const seconds = lockoutSeconds % 60;

    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Muitas tentativas</p>
          <p className="text-sm text-muted-foreground">
            Aguarde {minutes > 0 ? `${minutes}m ` : ""}{seconds}s para tentar novamente.
          </p>
        </div>
      </div>
    );
  };

  const getTitle = () => {
    switch (mode) {
      case "login": return "Entrar";
      case "signup": return "Criar Conta";
      case "forgot": return "Recuperar Senha";
      case "recovery": return "Nova Senha";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "login": return "Suas finanças em ordem, sua casa em paz";
      case "signup": return "Crie sua conta para começar";
      case "forgot": return "Digite seu email para recuperar o acesso";
      case "recovery": return "Escolha uma nova senha segura";
    }
  };

  const getButtonText = () => {
    if (isLoading) return "Carregando...";
    switch (mode) {
      case "login": return "Entrar";
      case "signup": return "Criar Conta";
      case "forgot": return "Enviar Email";
      case "recovery": return "Salvar Nova Senha";
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="w-20 h-20 rounded-3xl bg-accent/20 flex items-center justify-center mx-auto mb-4">
            <Home className="w-10 h-10 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Casa<span className="text-accent">Campos</span>
          </h1>
          <p className="text-muted-foreground mt-2">{getSubtitle()}</p>
        </div>

        {/* Lockout Warning */}
        {renderLockoutWarning()}

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 mt-4">
          {/* Display Name (signup only) */}
          {mode === "signup" && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Seu nome"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoComplete="name"
                className="mobile-input pl-12"
              />
            </div>
          )}

          {/* Email (not for recovery) */}
          {mode !== "recovery" && (
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="mobile-input pl-12"
              />
            </div>
          )}

          {/* Password */}
          {(mode === "login" || mode === "signup" || mode === "recovery") && (
            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "recovery" ? "Nova senha" : "Senha"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="mobile-input pl-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {renderPasswordRequirements()}
            </div>
          )}

          {/* Confirm Password (recovery only) */}
          {mode === "recovery" && (
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirmar nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="mobile-input pl-12"
              />
            </div>
          )}

          {/* Forgot Password Link */}
          {mode === "login" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-sm text-primary hover:underline"
              >
                Esqueceu a senha?
              </button>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            disabled={isLoading || lockoutSeconds > 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Carregando...
              </>
            ) : (
              getButtonText()
            )}
          </Button>
        </form>

        {/* Toggle Links */}
        <div className="mt-6 text-center space-y-2">
          {mode === "login" && (
            <p className="text-muted-foreground">
              Não tem uma conta?{" "}
              <button
                onClick={() => setMode("signup")}
                className="text-primary font-semibold hover:underline"
              >
                Cadastre-se
              </button>
            </p>
          )}
          {mode === "signup" && (
            <p className="text-muted-foreground">
              Já tem uma conta?{" "}
              <button
                onClick={() => setMode("login")}
                className="text-primary font-semibold hover:underline"
              >
                Entre
              </button>
            </p>
          )}
          {(mode === "forgot" || mode === "recovery") && (
            <p className="text-muted-foreground">
              <button
                onClick={() => setMode("login")}
                className="text-primary font-semibold hover:underline"
              >
                Voltar para o login
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground pb-safe py-4">
        Ao continuar, você concorda com nossos Termos de Uso
      </p>
    </div>
  );
}
