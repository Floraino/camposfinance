import { supabase } from "@/integrations/supabase/client";
import type { PlanType, HouseholdPlan } from "./householdService";

export interface PlanFeatures {
  // BASIC features (always available)
  unlimitedTransactions: boolean;
  unlimitedImageUpload: boolean;
  dashboard: boolean;
  charts: boolean;
  maxAccounts: number;
  
  // PRO features
  ocr: boolean;
  unlimitedAccounts: boolean;
  aiAssistant: boolean;
  exportReports: boolean;
}

export const BASIC_FEATURES: PlanFeatures = {
  unlimitedTransactions: true,
  unlimitedImageUpload: true,
  dashboard: true,
  charts: true,
  maxAccounts: 2,
  ocr: false,
  unlimitedAccounts: false,
  aiAssistant: false,
  exportReports: false,
};

export const PRO_FEATURES: PlanFeatures = {
  unlimitedTransactions: true,
  unlimitedImageUpload: true,
  dashboard: true,
  charts: true,
  maxAccounts: Infinity,
  ocr: true,
  unlimitedAccounts: true,
  aiAssistant: true,
  exportReports: true,
};

export function getPlanFeatures(plan: PlanType): PlanFeatures {
  return plan === "PRO" ? PRO_FEATURES : BASIC_FEATURES;
}

// Check if household can use OCR (PRO only)
export async function canUseOCR(householdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("household_plans")
    .select("plan, status")
    .eq("household_id", householdId)
    .single();

  if (error || !data) return false;
  return data.plan === "PRO" && data.status === "active";
}

// Check if household can create more accounts
export async function canCreateAccount(householdId: string): Promise<{ allowed: boolean; currentCount: number; maxCount: number }> {
  // Get plan
  const { data: planData } = await supabase
    .from("household_plans")
    .select("plan, status")
    .eq("household_id", householdId)
    .single();

  const plan = planData?.plan as PlanType || "BASIC";
  const features = getPlanFeatures(plan);

  // Count current accounts
  const { count } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("is_active", true);

  const currentCount = count || 0;
  const maxCount = features.maxAccounts;

  return {
    allowed: plan === "PRO" || currentCount < maxCount,
    currentCount,
    maxCount,
  };
}

// Check if household has premium AI features
export async function canUseAIAssistant(householdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("household_plans")
    .select("plan, status")
    .eq("household_id", householdId)
    .single();

  if (error || !data) return false;
  return data.plan === "PRO" && data.status === "active";
}

// Check if household can export reports
export async function canExportReports(householdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("household_plans")
    .select("plan, status")
    .eq("household_id", householdId)
    .single();

  if (error || !data) return false;
  return data.plan === "PRO" && data.status === "active";
}

// Upgrade household to PRO
export async function upgradeToPro(
  householdId: string,
  stripeSubscriptionId?: string,
  stripeCustomerId?: string
): Promise<HouseholdPlan> {
  const { data, error } = await supabase
    .from("household_plans")
    .update({
      plan: "PRO",
      status: "active",
      started_at: new Date().toISOString(),
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
    })
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as HouseholdPlan;
}

// Downgrade household to BASIC
export async function downgradeToBasic(householdId: string): Promise<HouseholdPlan> {
  const { data, error } = await supabase
    .from("household_plans")
    .update({
      plan: "BASIC",
      status: "active",
      stripe_subscription_id: null,
      stripe_customer_id: null,
    })
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as HouseholdPlan;
}

// PRO plan pricing
export const PRO_PRICING = {
  monthly: {
    amount: 19.90,
    currency: "BRL",
    interval: "month" as const,
  },
  yearly: {
    amount: 199.00,
    currency: "BRL",
    interval: "year" as const,
    savings: "2 meses grátis",
  },
};

// Plan comparison for UI
export const PLAN_COMPARISON = [
  {
    feature: "Lançamentos financeiros",
    basic: "Ilimitado",
    pro: "Ilimitado",
  },
  {
    feature: "Upload de imagens",
    basic: "Ilimitado (manual)",
    pro: "Ilimitado",
  },
  {
    feature: "Dashboard e gráficos",
    basic: "✓",
    pro: "✓",
  },
  {
    feature: "Contas (Carteira, Banco)",
    basic: "Até 2",
    pro: "Ilimitado",
  },
  {
    feature: "OCR / Scan automático",
    basic: "✗",
    pro: "✓",
  },
  {
    feature: "IA Financeira da Família",
    basic: "Básico",
    pro: "Completo",
  },
  {
    feature: "Exportação PDF/Excel",
    basic: "✗",
    pro: "✓",
  },
  {
    feature: "Relatórios avançados",
    basic: "✗",
    pro: "✓",
  },
];
