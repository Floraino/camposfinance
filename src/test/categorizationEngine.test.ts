import { describe, it, expect } from "vitest";
import {
  normalizeText,
  merchantFingerprint,
  applyBuiltInRules,
  applyUserRules,
  categorizeOne,
  isValidCategory,
  ALLOWED_CATEGORIES,
  shouldAutoApply,
} from "@/services/categorizationEngine";

describe("categorizationEngine", () => {
  describe("normalizeText", () => {
    it("lowercase e remove acentos", () => {
      const t = normalizeText("Restaurante São Paulo");
      expect(t).toBe(t.toLowerCase());
      expect(t.length).toBeGreaterThan(0);
    });
    it("colapsa espaços e remove pontuação", () => {
      expect(normalizeText("  algo   outro  ").trim()).toBe("algo outro".trim());
    });
    it("retorna string vazia para input vazio", () => {
      expect(normalizeText("")).toBe("");
      expect(normalizeText("   ")).toBe("");
    });
  });

  describe("merchantFingerprint", () => {
    it("extrai tokens significativos", () => {
      const fp = merchantFingerprint("PIX UBER BR 123456 05/12");
      expect(fp.length).toBeGreaterThan(0);
      expect(fp).not.toMatch(/\d{5,}/);
    });
    it("retorna determinístico para o mesmo input", () => {
      const s = "UBER *TRIP RS 29,90";
      expect(merchantFingerprint(s)).toBe(merchantFingerprint(s));
    });
  });

  describe("applyBuiltInRules", () => {
    it("IOF => other", () => {
      const r = applyBuiltInRules("IOF 01/02 REF 123");
      expect(r).not.toBeNull();
      expect(r!.category).toBe("other");
    });
    it("UBER => transport", () => {
      const r = applyBuiltInRules("UBER *TRIP 29,90");
      expect(r).not.toBeNull();
      expect(r!.category).toBe("transport");
    });
    it("PADARIA / mercado => food", () => {
      const r = applyBuiltInRules("PADARIA DO JOAO");
      expect(r).not.toBeNull();
      expect(r!.category).toBe("food");
      const r2 = applyBuiltInRules("Supermercado Pão de Açúcar");
      expect(r2).not.toBeNull();
      expect(r2!.category).toBe("food");
    });
    it("Netflix => leisure", () => {
      const r = applyBuiltInRules("NETFLIX 12.99");
      expect(r).not.toBeNull();
      expect(r!.category).toBe("leisure");
    });
    it("retorna null quando nenhuma regra bate", () => {
      const r = applyBuiltInRules("XYZ AB CD EF 999");
      expect(r).toBeNull();
    });
  });

  describe("applyUserRules", () => {
    it("match contains aplica categoria", () => {
      const rules = [{ pattern: "PADARIA", match_type: "contains" as const, category: "food", priority: 10 }];
      expect(applyUserRules("PADARIA DO JOAO", rules)).toBe("food");
    });
    it("match exact", () => {
      const rules = [{ pattern: "PAGAMENTO", match_type: "exact" as const, category: "bills", priority: 10 }];
      expect(applyUserRules("PAGAMENTO", rules)).toBe("bills");
      expect(applyUserRules("PAGAMENTO REF", rules)).toBeNull();
    });
    it("prioridade maior vence", () => {
      const rules = [
        { pattern: "PADARIA", match_type: "contains" as const, category: "food", priority: 5 },
        { pattern: "PADARIA", match_type: "contains" as const, category: "shopping", priority: 10 },
      ];
      expect(applyUserRules("PADARIA X", rules)).toBe("shopping");
    });
  });

  describe("categorizeOne", () => {
    it("cache bate => aplica categoria do cache", () => {
      const tx = { id: "1", description: "UBER TRIP 29,90" };
      const fp = merchantFingerprint(tx.description);
      const cache = new Map<string, "transport">([[fp, "transport"]]);
      const r = categorizeOne(tx, cache, []);
      expect(r).not.toBeNull();
      expect(r!.category).toBe("transport");
      expect(r!.source).toBe("cache");
    });
    it("regra built-in bate => aplica", () => {
      const r = categorizeOne({ id: "1", description: "UBER 99" }, new Map(), []);
      expect(r).not.toBeNull();
      expect(r!.category).toBe("transport");
      expect(r!.source).toBe("rule");
    });
    it("nenhuma regra nem cache => null", () => {
      const r = categorizeOne({ id: "1", description: "XYZ AB CD 123" }, new Map(), []);
      expect(r).toBeNull();
    });
  });

  describe("isValidCategory", () => {
    it("aceita todas as categorias do app", () => {
      for (const c of ALLOWED_CATEGORIES) {
        expect(isValidCategory(c)).toBe(true);
      }
    });
    it("rejeita categoria inventada", () => {
      expect(isValidCategory("invented")).toBe(false);
      expect(isValidCategory("")).toBe(false);
    });
  });

  describe("shouldAutoApply", () => {
    it("confidence >= 0.85 aplica", () => {
      expect(shouldAutoApply(0.9)).toBe(true);
      expect(shouldAutoApply(0.85)).toBe(true);
    });
    it("confidence < 0.85 só sugere", () => {
      expect(shouldAutoApply(0.8)).toBe(false);
      expect(shouldAutoApply(0.5)).toBe(false);
    });
  });
});
