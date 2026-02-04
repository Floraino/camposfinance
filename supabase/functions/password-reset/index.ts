import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip",
};

interface PasswordResetRequest {
  email: string;
  redirectUrl: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { email, redirectUrl }: PasswordResetRequest = await req.json();

    // Get IP for logging
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit password reset requests (prevent abuse)
    const { data: rateLimit } = await supabaseAdmin.rpc("check_login_rate_limit", {
      _identifier: `reset_${email.toLowerCase()}`,
      _identifier_type: "email",
      _max_attempts: 3,
      _window_minutes: 60,
      _lockout_minutes: 60,
    });

    if (rateLimit && !rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          // Generic message - don't reveal if account exists
          message: "Se o email estiver cadastrado, você receberá um link de recuperação.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the request
    await supabaseAdmin.rpc("log_auth_event", {
      _event_type: "password_reset_requested",
      _email: email,
      _ip_address: ipAddress,
      _user_agent: userAgent,
      _metadata: {},
    });

    // Send password reset email
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl || `${req.headers.get("origin")}/auth?type=recovery`,
    });

    if (error) {
      console.error("Password reset error:", error);
      // Don't reveal if email exists or not
    }

    // Always return success (prevents email enumeration)
    return new Response(
      JSON.stringify({
        message: "Se o email estiver cadastrado, você receberá um link de recuperação.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Password reset error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
