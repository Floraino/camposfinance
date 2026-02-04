import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip, x-device-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Verify the token and get user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get IP for logging
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const deviceId = req.headers.get("x-device-id") || undefined;

    // Log the logout event
    await supabaseAdmin.rpc("log_auth_event", {
      _event_type: "logout",
      _user_id: user.id,
      _email: user.email,
      _ip_address: ipAddress,
      _user_agent: userAgent,
      _device_id: deviceId,
      _metadata: {},
    });

    // Sign out the user (revokes refresh token)
    await supabaseAdmin.auth.admin.signOut(token);

    return new Response(
      JSON.stringify({ success: true, message: "Logout realizado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Logout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao fazer logout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
