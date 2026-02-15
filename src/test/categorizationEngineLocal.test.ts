import { describe, it, expect } from "vitest";
import {
  normalizeText,
  merchantFingerprint,
  applyCacheFirst,
  applyRules,
  categorizeOne,
  shouldAutoApply,
  AUTO_APPLY_CONFIDENCE,
} from "@/services/categorizationEngineLocal";
import type { CategoryRuleRow } from "@/services/categoryRulesService";
import type { TxInput } from "@/services/categorizationEngineLocal";

const mockRule = (overrides: Partial<CategoryRuleRow>): CategoryRuleRow => ({
  id: "r1",
  family_id: null,
  category_id: "transport",
  name: "uber",
  match_type: "contains",
  pattern: "UBER",
  flags: null,
  priority: 80,
  confidence: 0.9,
  is_active: true,
  ...overrides,
});

describe("categorizationEngineLocal", () => {
  describe("normalizeText", () => {
    it("remove acentos e tokens bancários comuns", () => {
      const t = normalizeText("PIX UBER PAGAMENTO 123");
      expect(t).not.toContain("pix");
      expect(t.length).toBeGreaterThan(0);
    });
  });

  describe("merchantFingerprint", () => {
    it("estável para mesmo input", () => {
      const s = "UBER TRIP 29,90";
      expect(merchantFingerprint(s)).toBe(merchantFingerprint(s));
    });
  });

  describe("applyCacheFirst", () => {
    it("retorna categoria quando fingerprint está no cache", () => {
      const tx: TxInput = { id: "1", description: "UBER TRIP" };
      const fp = merchantFingerprint(tx.description);
      const cache = new Map<string, string>([[fp, "transport"]]);
      const r = applyCacheFirst(tx, cache);
      expect(r).not.toBeNull();
      expect(r!.categoryId).toBe("transport");
      expect(r!.source).toBe("cache");
    });
    it("retorna null quando fingerprint não está no cache", () => {
      const tx: TxInput = { id: "1", description: "XYZ DESCONHECIDO" };
      const cache = new Map<string, string>();
      expect(applyCacheFirst(tx, cache)).toBeNull();
    });
  });

  describe("applyRules", () => {
    it("aplica regra de maior prioridade", () => {
      const tx: TxInput = { id: "1", description: "UBER *TRIP 29,90" };
      const rules: CategoryRuleRow[] = [
        mockRule({ pattern: "UBER", priority: 80, category_id: "transport" }),
        mockRule({ pattern: "TRIP", priority: 50, category_id: "leisure" }),
      ];
      const r = applyRules(tx, rules);
      expect(r).not.toBeNull();
      expect(r!.categoryId).toBe("transport");
      expect(r!.source).toBe("rule");
    });
    it("tie-break: equals > contains", () => {
      const tx: TxInput = { id: "1", description: "PAGAMENTO" };
      const rules: CategoryRuleRow[] = [
        mockRule({ pattern: "PAG", match_type: "contains", priority: 50, category_id: "other" }),
        mockRule({ pattern: "PAGAMENTO", match_type: "equals", priority: 50, category_id: "bills" }),
      ];
      const r = applyRules(tx, rules);
      expect(r).not.toBeNull();
      expect(r!.categoryId).toBe("bills");
    });
    it("retorna null quando nenhuma regra bate", () => {
      const tx: TxInput = { id: "1", description: "XYZ AB CD" };
      const rules: CategoryRuleRow[] = [mockRule({ pattern: "UBER", category_id: "transport" })];
      expect(applyRules(tx, rules)).toBeNull();
    });
  });

  describe("categorizeOne", () => {
    it("cache tem prioridade sobre regras", () => {
      const tx: TxInput = { id: "1", description: "UBER TRIP" };
      const fp = merchantFingerprint(tx.description);
      const cache = new Map<string, string>([[fp, "food"]]);
      const rules = [mockRule({ pattern: "UBER", category_id: "transport" })];
      const r = categorizeOne(tx, cache, rules);
      expect(r).not.toBeNull();
      expect(r!.categoryId).toBe("food");
      expect(r!.source).toBe("cache");
    });
    it("aplica regra quando cache não bate", () => {
      const tx: TxInput = { id: "1", description: "UBER 99" };
      const r = categorizeOne(tx, new Map(), [
        mockRule({ pattern: "UBER", category_id: "transport", confidence: 0.9 }),
      ]);
      expect(r).not.toBeNull();
      expect(r!.categoryId).toBe("transport");
    });
  });

  describe("shouldAutoApply", () => {
    it("confidence >= 0.85 aplica", () => {
      expect(shouldAutoApply(0.85)).toBe(true);
      expect(shouldAutoApply(0.9)).toBe(true);
    });
    it("confidence < 0.85 não aplica", () => {
      expect(shouldAutoApply(0.84)).toBe(false);
    });
  });

  it("AUTO_APPLY_CONFIDENCE é 0.85", () => {
    expect(AUTO_APPLY_CONFIDENCE).toBe(0.85);
  });
});
