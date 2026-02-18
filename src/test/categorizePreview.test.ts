import { describe, it, expect } from "vitest";
import { parseCategorizePreview } from "@/components/assistant/AssistantChat";
import { categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";

const VALID_CATEGORIES = new Set<string>(Object.keys(categoryConfig));

function isValidCategory(cat: string): cat is CategoryType {
  return VALID_CATEGORIES.has(cat);
}

describe("parseCategorizePreview", () => {
  it("returns null for content without CATEGORIZE_PREVIEW", () => {
    expect(parseCategorizePreview("Hello world")).toBeNull();
    expect(parseCategorizePreview("<!-- DELETION_PREVIEW:{} -->")).toBeNull();
  });

  it("parses valid CATEGORIZE_PREVIEW payload", () => {
    const payload = {
      householdId: "hh-1",
      householdName: "Família",
      suggestions: [
        {
          transaction_id: "tx-1",
          description: "Supermercado",
          amount: -150,
          date: "2025-02-17",
          category: "food",
          confidence: 0.9,
          reason: "",
        },
      ],
    };
    const content = `Encontrei 1 gasto(s).\n\n<!-- CATEGORIZE_PREVIEW:${JSON.stringify(payload)} -->`;
    const result = parseCategorizePreview(content);
    expect(result).not.toBeNull();
    expect(result!.householdId).toBe("hh-1");
    expect(result!.householdName).toBe("Família");
    expect(result!.suggestions).toHaveLength(1);
    expect(result!.suggestions[0].transaction_id).toBe("tx-1");
    expect(result!.suggestions[0].category).toBe("food");
    expect(result!.suggestions[0].confidence).toBe(0.9);
  });

  it("returns null for invalid JSON inside preview", () => {
    const content = "<!-- CATEGORIZE_PREVIEW:{ invalid -->";
    expect(parseCategorizePreview(content)).toBeNull();
  });
});

describe("category validation for categorize flow", () => {
  it("accepts only app CategoryType values", () => {
    const allowed = ["food", "transport", "bills", "health", "education", "shopping", "leisure", "other"];
    allowed.forEach((cat) => {
      expect(isValidCategory(cat)).toBe(true);
    });
  });

  it("rejects entertainment (backend may return; frontend uses leisure)", () => {
    expect(isValidCategory("entertainment")).toBe(false);
  });

  it("rejects unknown category", () => {
    expect(isValidCategory("unknown")).toBe(false);
  });
});
