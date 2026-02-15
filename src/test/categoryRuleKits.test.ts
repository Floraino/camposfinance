import { describe, it, expect } from "vitest";
import { inferKit, getAllKits, ensureMinPatternsPerKit } from "@/services/categoryRuleKits";

describe("categoryRuleKits", () => {
  describe("inferKit", () => {
    it("mapeia slug da categoria para kit correto", () => {
      expect(inferKit("food").categoryId).toBe("food");
      expect(inferKit("transport").categoryId).toBe("transport");
      expect(inferKit("bills").categoryId).toBe("bills");
      expect(inferKit("health").categoryId).toBe("health");
      expect(inferKit("education").categoryId).toBe("education");
      expect(inferKit("shopping").categoryId).toBe("shopping");
      expect(inferKit("leisure").categoryId).toBe("leisure");
      expect(inferKit("other").categoryId).toBe("other");
    });
    it("mapeia nome (Alimentação) para food", () => {
      expect(inferKit("Alimentação").categoryId).toBe("food");
      expect(inferKit("Contas Fixas").categoryId).toBe("bills");
      expect(inferKit("Transporte").categoryId).toBe("transport");
    });
    it("retorna kit other para nome desconhecido", () => {
      expect(inferKit("Qualquer Coisa").categoryId).toBe("other");
    });
  });

  describe("getAllKits", () => {
    it("retorna 8 kits (uma por categoria)", () => {
      const kits = getAllKits();
      expect(kits.length).toBe(8);
    });
  });

  describe("ensureMinPatternsPerKit", () => {
    it("não lança quando cada kit tem >= 100 patterns", () => {
      expect(() => ensureMinPatternsPerKit(100)).not.toThrow();
    });
    it("lança quando exigir mais que temos", () => {
      expect(() => ensureMinPatternsPerKit(9999)).toThrow();
    });
  });

  describe("seed não duplica", () => {
    it("cada kit tem >= 100 patterns", () => {
      const kits = getAllKits();
      for (const kit of kits) {
        expect(kit.patterns.length).toBeGreaterThanOrEqual(100);
      }
    });
  });
});
