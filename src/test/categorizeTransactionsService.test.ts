import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/services/categoryRulesService", () => ({
  getCategoryRulesForFamily: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/merchantCategoryCacheService", () => ({
  getCacheByFingerprints: vi.fn().mockResolvedValue(new Map()),
  setCacheFromRule: vi.fn().mockResolvedValue(undefined),
}));

import { categorizeTransactionsService } from "@/services/categorizeTransactionsService";
import { getCategoryRulesForFamily } from "@/services/categoryRulesService";
import { getCacheByFingerprints } from "@/services/merchantCategoryCacheService";
import { supabase } from "@/integrations/supabase/client";
import { merchantFingerprint } from "@/services/categorizationEngineLocal";

function setupSupabaseMocks(transactions: unknown[]) {
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: transactions, error: null }),
            in: vi.fn().mockReturnThis(),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({ eq: mockUpdate }),
  });
  (supabase as any).from = fromMock;
  return fromMock;
}

describe("categorizeTransactionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ error: null });
  });

  it("retorna erro quando familyId não é fornecido", async () => {
    setupSupabaseMocks([]);
    const result = await categorizeTransactionsService({ familyId: "" });
    expect(result.errors).toContain("familyId é obrigatório");
    expect(result.appliedByCache).toBe(0);
    expect(result.appliedByRules).toBe(0);
    expect(result.sentToAI).toBe(0);
  });

  it("local-only: transação que bate no cache é categorizada e IA não é chamada", async () => {
    const tx = { id: "tx-1", description: "UBER TRIP 29,90", amount: 29.9, transaction_date: "2026-01-01" };
    const fp = merchantFingerprint(tx.description);
    setupSupabaseMocks([tx]);

    (getCacheByFingerprints as any).mockResolvedValueOnce(new Map([[fp, "transport"]]));
    (getCategoryRulesForFamily as any).mockResolvedValueOnce([]);

    const result = await categorizeTransactionsService({
      familyId: "fam-1",
      useAI: true,
    });

    expect(result.appliedByCache).toBe(1);
    expect(result.appliedByRules).toBe(0);
    expect(result.sentToAI).toBe(0);
    expect(result.appliedByAI).toBe(0);
    expect(result.remainingUncategorized).toBe(0);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("local-only: transação que bate em regra é categorizada e IA não é chamada", async () => {
    const tx = { id: "tx-2", description: "NETFLIX MENSAL", amount: 49.9, transaction_date: "2026-01-02" };
    setupSupabaseMocks([tx]);

    (getCacheByFingerprints as any).mockResolvedValueOnce(new Map());
    (getCategoryRulesForFamily as any).mockResolvedValueOnce([
      {
        id: "r1",
        family_id: null,
        category_id: "leisure",
        name: "netflix",
        match_type: "contains",
        pattern: "NETFLIX",
        flags: null,
        priority: 90,
        confidence: 0.9,
        is_active: true,
      },
    ]);

    const result = await categorizeTransactionsService({
      familyId: "fam-1",
      useAI: true,
    });

    expect(result.appliedByCache).toBe(0);
    expect(result.appliedByRules).toBe(1);
    expect(result.sentToAI).toBe(0);
    expect(result.appliedByAI).toBe(0);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("local-first + AI fallback: uma bate regra e uma vai para IA", async () => {
    const t1 = { id: "tx-a", description: "UBER 99", amount: 15, transaction_date: "2026-01-01" };
    const t2 = { id: "tx-b", description: "DESPESA GENÉRICA XYZ", amount: 100, transaction_date: "2026-01-02" };
    setupSupabaseMocks([t1, t2]);

    (getCacheByFingerprints as any).mockResolvedValueOnce(new Map());
    (getCategoryRulesForFamily as any).mockResolvedValueOnce([
      {
        id: "r1",
        family_id: null,
        category_id: "transport",
        name: "uber",
        match_type: "contains",
        pattern: "UBER",
        flags: null,
        priority: 90,
        confidence: 0.9,
        is_active: true,
      },
    ]);

    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: { categories: [{ id: "tx-b", category: "other", confidence: 0.9 }] },
      error: null,
    });

    const result = await categorizeTransactionsService({
      familyId: "fam-1",
      useAI: true,
    });

    expect(result.appliedByCache).toBe(0);
    expect(result.appliedByRules).toBe(1);
    expect(result.sentToAI).toBe(1);
    expect(result.appliedByAI).toBe(1);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect((supabase.functions.invoke as any).mock.calls[0][1].body.descriptions).toHaveLength(1);
    expect((supabase.functions.invoke as any).mock.calls[0][1].body.descriptions[0].id).toBe("tx-b");
  });

  it("IA não recebe transações já categorizadas (só remanescentes após local)", async () => {
    const onlyUncategorized = [
      { id: "only-other", description: "QUALQUER COISA", amount: 50, transaction_date: "2026-01-01", category: "other" },
    ];
    setupSupabaseMocks(onlyUncategorized);

    (getCacheByFingerprints as any).mockResolvedValueOnce(new Map());
    (getCategoryRulesForFamily as any).mockResolvedValueOnce([]);

    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: { categories: [{ id: "only-other", category: "food", confidence: 0.9 }] },
      error: null,
    });

    const result = await categorizeTransactionsService({
      familyId: "fam-1",
      useAI: true,
    });

    expect(result.sentToAI).toBe(1);
    expect(result.appliedByAI).toBe(1);
  });

  it("stats batem: zero transações retorna zeros", async () => {
    setupSupabaseMocks([]);

    const result = await categorizeTransactionsService({
      familyId: "fam-1",
      useAI: true,
    });

    expect(result.appliedByCache).toBe(0);
    expect(result.appliedByRules).toBe(0);
    expect(result.sentToAI).toBe(0);
    expect(result.appliedByAI).toBe(0);
    expect(result.remainingUncategorized).toBe(0);
  });

  it("useAI false: não chama IA mesmo com remanescentes", async () => {
    const tx = { id: "tx-no-rule", description: "DESCONHECIDO 123", amount: 10, transaction_date: "2026-01-01" };
    setupSupabaseMocks([tx]);

    (getCacheByFingerprints as any).mockResolvedValueOnce(new Map());
    (getCategoryRulesForFamily as any).mockResolvedValueOnce([]);

    const result = await categorizeTransactionsService({
      familyId: "fam-1",
      useAI: false,
    });

    expect(result.appliedByCache).toBe(0);
    expect(result.appliedByRules).toBe(0);
    expect(result.sentToAI).toBe(0);
    expect(result.appliedByAI).toBe(0);
    expect(result.remainingUncategorized).toBe(1);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
