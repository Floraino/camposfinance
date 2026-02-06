import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, isMobileApp } from "@/lib/authValidation";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface SecureLoginResult {
  success: boolean;
  error?: string;
  locked?: boolean;
  remainingSeconds?: number;
}

interface PasswordResetResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Secure login with rate limiting. Falls back to direct Supabase auth if Edge Function is unavailable (e.g. new project).
export async function secureLogin(
  email: string,
  password: string
): Promise<SecureLoginResult> {
  try {
    const deviceId = getDeviceId();

    const response = await fetch(`${SUPABASE_URL}/functions/v1/secure-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        "x-device-id": deviceId,
      },
      body: JSON.stringify({ email, password, deviceId }),
    });

    const data = await response.json();

    // Edge Function not deployed (404) or server error → try direct login
    if (response.status === 404 || response.status >= 500) {
      const direct = await supabase.auth.signInWithPassword({ email, password });
      if (direct.error) {
        return { success: false, error: direct.error.message };
      }
      return { success: true };
    }

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Erro ao fazer login",
        locked: data.locked,
        remainingSeconds: data.remainingSeconds,
      };
    }

    // Set session in supabase client
    if (data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    return { success: true };
  } catch (error) {
    // Network/CORS/connection error → fallback to direct login
    try {
      const direct = await supabase.auth.signInWithPassword({ email, password });
      if (direct.error) {
        return {
          success: false,
          error: direct.error.message || "Erro de conexão. Verifique sua internet.",
        };
      }
      return { success: true };
    } catch (fallbackError) {
      console.error("Secure login error:", fallbackError);
      return {
        success: false,
        error: "Erro de conexão. Verifique sua internet e a URL/chave do Supabase no .env",
      };
    }
  }
}

// Request password reset
export async function requestPasswordReset(
  email: string,
  redirectUrl?: string
): Promise<PasswordResetResult> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/password-reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        redirectUrl: redirectUrl || `${window.location.origin}/auth?type=recovery`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Erro ao solicitar recuperação",
      };
    }

    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error("Password reset error:", error);
    return {
      success: false,
      error: "Erro de conexão. Tente novamente.",
    };
  }
}

// Secure logout with session revocation
export async function secureLogout(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      // Call secure logout endpoint to revoke session
      await fetch(`${SUPABASE_URL}/functions/v1/auth-logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          "x-device-id": getDeviceId(),
        },
      });
    }

    // Always sign out locally
    await supabase.auth.signOut();

    // Clear any cached data
    if (!isMobileApp()) {
      // Web: tokens are in cookies (HttpOnly when configured correctly)
      // Just ensure local state is cleared
    }

    return true;
  } catch (error) {
    console.error("Logout error:", error);
    // Even if server logout fails, sign out locally
    await supabase.auth.signOut();
    return true;
  }
}

// Update password (for logged in users or password recovery)
export async function updatePassword(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Log password change event
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      // The event will be logged server-side in future enhancement
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Erro ao alterar senha" };
  }
}

// Get auth events for the current user
export async function getAuthEvents(limit = 10): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from("auth_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching auth events:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error fetching auth events:", error);
    return [];
  }
}
