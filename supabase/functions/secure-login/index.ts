import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip, x-device-id",
};

interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;
const LOCKOUT_MINUTES = 15;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { email, password, deviceId }: LoginRequest = await req.json();

    // Get IP address from headers
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit by email
    const { data: emailRateLimit } = await supabaseAdmin.rpc("check_login_rate_limit", {
      _identifier: email.toLowerCase(),
      _identifier_type: "email",
      _max_attempts: MAX_ATTEMPTS,
      _window_minutes: WINDOW_MINUTES,
      _lockout_minutes: LOCKOUT_MINUTES,
    });

    if (emailRateLimit && !emailRateLimit.allowed) {
      const remainingSeconds = emailRateLimit.remaining_seconds || LOCKOUT_MINUTES * 60;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);

      // Log the lockout event
      await supabaseAdmin.rpc("log_auth_event", {
        _event_type: "account_locked",
        _email: email,
        _ip_address: ipAddress,
        _user_agent: userAgent,
        _device_id: deviceId,
        _metadata: { reason: "rate_limit_exceeded", lockout_minutes: remainingMinutes },
      });

      return new Response(
        JSON.stringify({
          error: `Muitas tentativas. Tente novamente em ${remainingMinutes} minuto${remainingMinutes > 1 ? "s" : ""}.`,
          locked: true,
          remainingSeconds,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit by IP
    const { data: ipRateLimit } = await supabaseAdmin.rpc("check_login_rate_limit", {
      _identifier: ipAddress,
      _identifier_type: "ip",
      _max_attempts: MAX_ATTEMPTS * 2, // More lenient for IP (shared IPs)
      _window_minutes: WINDOW_MINUTES,
      _lockout_minutes: LOCKOUT_MINUTES,
    });

    if (ipRateLimit && !ipRateLimit.allowed) {
      const remainingSeconds = ipRateLimit.remaining_seconds || LOCKOUT_MINUTES * 60;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);

      return new Response(
        JSON.stringify({
          error: `Muitas tentativas deste endereço. Tente novamente em ${remainingMinutes} minuto${remainingMinutes > 1 ? "s" : ""}.`,
          locked: true,
          remainingSeconds,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Attempt login
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      // Log failed attempt
      await supabaseAdmin.rpc("log_auth_event", {
        _event_type: "login_failed",
        _email: email,
        _ip_address: ipAddress,
        _user_agent: userAgent,
        _device_id: deviceId,
        _metadata: { error: authError?.message || "unknown" },
      });

      // Generic error message to prevent enumeration
      return new Response(
        JSON.stringify({ error: "Email ou senha inválidos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Login successful - reset rate limits
    await supabaseAdmin.rpc("reset_login_rate_limit", {
      _identifier: email.toLowerCase(),
      _identifier_type: "email",
    });

    await supabaseAdmin.rpc("reset_login_rate_limit", {
      _identifier: ipAddress,
      _identifier_type: "ip",
    });

    // Log successful login
    await supabaseAdmin.rpc("log_auth_event", {
      _event_type: "login_success",
      _user_id: authData.user.id,
      _email: email,
      _ip_address: ipAddress,
      _user_agent: userAgent,
      _device_id: deviceId,
      _metadata: {},
    });

    // Return session data
    return new Response(
      JSON.stringify({
        session: authData.session,
        user: authData.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
