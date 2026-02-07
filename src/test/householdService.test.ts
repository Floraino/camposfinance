import { describe, it, expect, vi, beforeEach } from "vitest";
import { getHouseholdPlan } from "@/services/householdService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Quando o pagamento é aprovado (checkout.session.completed ou invoice.paid),
 * o webhook Stripe atualiza household_plans com plan: "PRO".
 * Este teste garante que, nessa situação, a família aparece como Pro no app
 * (getHouseholdPlan retorna plan: "PRO").
 */
describe("quando o pagamento é aprovado a família vira Pro", () => {
  it("getHouseholdPlan retorna plan PRO quando o backend (webhook) já atualizou o plano", async () => {
    const householdId = "household-pro-after-payment";
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn().mockResolvedValueOnce({
      data: {
        id: "plan-1",
        household_id: householdId,
        plan: "PRO",
        status: "active",
        started_at: "2026-02-01T00:00:00.000Z",
        expires_at: null,
        pro_expires_at: "2026-03-01T00:00:00.000Z",
        source: "subscription",
        stripe_subscription_id: "sub_xxx",
        stripe_customer_id: "cus_xxx",
        created_at: "2026-02-01T00:00:00.000Z",
        updated_at: new Date().toISOString(),
      },
      error: null,
    });
    (supabase as any).from.mockReturnValueOnce(chain);

    const plan = await getHouseholdPlan(householdId);

    expect(plan).not.toBeNull();
    expect(plan!.plan).toBe("PRO");
    expect(plan!.status).toBe("active");
    expect((supabase as any).from).toHaveBeenCalledWith("household_plans");
  });

  it("getHouseholdPlan retorna BASIC quando o plano ainda não foi aprovado", async () => {
    const householdId = "household-basic";
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn().mockResolvedValueOnce({
      data: {
        id: "plan-2",
        household_id: householdId,
        plan: "BASIC",
        status: "active",
        started_at: "2026-01-01T00:00:00.000Z",
        expires_at: null,
        pro_expires_at: null,
        source: null,
        stripe_subscription_id: null,
        stripe_customer_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
    (supabase as any).from.mockReturnValueOnce(chain);

    const plan = await getHouseholdPlan(householdId);

    expect(plan).not.toBeNull();
    expect(plan!.plan).toBe("BASIC");
  });
});
