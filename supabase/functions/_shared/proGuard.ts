/**
 * Backend Guard for PRO features
 * 
 * This module provides validation functions for edge functions
 * to ensure PRO features are only accessible by PRO families.
 * 
 * Usage in edge functions:
 * ```typescript
 * import { validateProAccess } from "./proGuard.ts";
 * 
 * const validation = await validateProAccess(supabase, userId, householdId, "OCR_SCAN");
 * if (!validation.allowed) {
 *   return new Response(JSON.stringify(validation.error), { status: 403 });
 * }
 * ```
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ProFeatureKey = 
  | "OCR_SCAN"
  | "OCR_IMAGE_EXTRACT"
  | "CSV_IMPORT"
  | "DATA_EXPORT"
  | "AI_ASSISTANT"
  | "UNLIMITED_ACCOUNTS";

export interface ProAccessResult {
  allowed: boolean;
  error?: {
    error: string;
    message: string;
    code: "PRO_REQUIRED" | "NOT_MEMBER" | "MISSING_HOUSEHOLD";
  };
}

/**
 * Validate PRO feature access for a user in a household
 * 
 * This is the SINGLE backend validation point for all PRO features.
 * Every edge function that handles PRO features MUST use this.
 */
export async function validateProAccess(
  supabase: SupabaseClient,
  userId: string,
  householdId: string | null | undefined,
  feature: ProFeatureKey
): Promise<ProAccessResult> {
  // Check if householdId is provided
  if (!householdId) {
    return {
      allowed: false,
      error: {
        error: "Household ID é obrigatório",
        message: "Selecione uma família para continuar",
        code: "MISSING_HOUSEHOLD",
      },
    };
  }

  // Check if user is member of the household
  const { data: memberData, error: memberError } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .single();

  if (memberError || !memberData) {
    return {
      allowed: false,
      error: {
        error: "Você não é membro desta família",
        message: "Você precisa ser membro da família para acessar este recurso",
        code: "NOT_MEMBER",
      },
    };
  }

  // Check if household has PRO plan using the can_use_ocr function
  // (This works for all PRO features since they all require PRO plan)
  const { data: canUsePro, error: planError } = await supabase
    .rpc("get_household_plan", { _household_id: householdId });

  if (planError) {
    console.error(`Error checking ${feature} permission:`, planError);
    return {
      allowed: false,
      error: {
        error: "Erro ao verificar permissão",
        message: "Tente novamente mais tarde",
        code: "PRO_REQUIRED",
      },
    };
  }

  if (canUsePro !== "PRO") {
    return {
      allowed: false,
      error: {
        error: "Recurso PRO",
        message: `${getFeatureName(feature)} está disponível apenas no plano PRO da família`,
        code: "PRO_REQUIRED",
      },
    };
  }

  return { allowed: true };
}

/**
 * Get human-readable feature name
 */
function getFeatureName(feature: ProFeatureKey): string {
  const names: Record<ProFeatureKey, string> = {
    OCR_SCAN: "Escanear Cupom",
    OCR_IMAGE_EXTRACT: "Extração Automática",
    CSV_IMPORT: "Importação CSV",
    DATA_EXPORT: "Exportação de Relatórios",
    AI_ASSISTANT: "Assistente IA",
    UNLIMITED_ACCOUNTS: "Contas Ilimitadas",
  };
  return names[feature];
}

/**
 * CORS headers for edge functions
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Create a 403 Forbidden response for PRO feature access denial
 */
export function createProRequiredResponse(validation: ProAccessResult): Response {
  return new Response(
    JSON.stringify(validation.error),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
