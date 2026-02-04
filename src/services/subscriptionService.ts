import { supabase } from "@/integrations/supabase/client";

export type PriceType = "monthly" | "yearly";

export interface SubscriptionStatus {
  plan: "BASIC" | "PRO";
  status: string;
  subscribed: boolean;
  pro_expires_at?: string;
  subscription_id?: string;
  provider?: string;
}

/**
 * Create a Stripe checkout session for subscribing to PRO
 */
export async function createCheckout(
  householdId: string,
  priceType: PriceType
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: { householdId, priceType },
  });

  if (error) {
    throw new Error(error.message || "Erro ao criar sessão de pagamento");
  }

  if (!data?.url) {
    throw new Error("URL de checkout não retornada");
  }

  return data.url;
}

/**
 * Check subscription status for a household
 */
export async function checkSubscription(
  householdId: string
): Promise<SubscriptionStatus> {
  const { data, error } = await supabase.functions.invoke("check-subscription", {
    body: { householdId },
  });

  if (error) {
    console.error("Error checking subscription:", error);
    return {
      plan: "BASIC",
      status: "unknown",
      subscribed: false,
    };
  }

  return data as SubscriptionStatus;
}

/**
 * Open Stripe Customer Portal for managing subscription
 */
export async function openCustomerPortal(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("customer-portal");

  if (error) {
    throw new Error(error.message || "Erro ao abrir portal de gerenciamento");
  }

  if (!data?.url) {
    throw new Error("URL do portal não retornada");
  }

  return data.url;
}

/**
 * Format price for display in BRL
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

/**
 * PRO plan pricing configuration
 */
export const PRO_PRICING = {
  monthly: {
    amount: 9.90,
    formatted: "R$ 9,90",
    interval: "mês",
    description: "Mensal",
  },
  yearly: {
    amount: 89.90,
    formatted: "R$ 89,90",
    interval: "ano",
    description: "Anual",
    savings: "Economize R$ 28,90",
  },
};
