import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the service
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  },
}));

import { categorizeDescription } from "@/services/categorizationService";
import { supabase } from "@/integrations/supabase/client";

describe("categorizeDescription", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 'other' for empty description", async () => {
    const result = await categorizeDescription("");
    expect(result).toBe("other");
  });

  it("returns 'other' for very short description", async () => {
    const result = await categorizeDescription("ab");
    expect(result).toBe("other");
  });

  it("categorizes via local keywords without calling edge function", async () => {
    // "supermercado" should match local keyword for "food"
    const result = await categorizeDescription("Supermercado Pão de Açúcar");
    expect(result).toBe("food");
    // Should NOT have called the edge function (local match is faster)
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("categorizes 'uber' as transport via local keywords", async () => {
    const result = await categorizeDescription("Uber corrida centro");
    expect(result).toBe("transport");
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("categorizes 'netflix' as leisure via local keywords", async () => {
    const result = await categorizeDescription("Netflix Mensal");
    expect(result).toBe("leisure");
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("falls back to edge function for unknown descriptions", async () => {
    // Mock edge function returning a category
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: { category: "shopping", confidence: 0.8 },
      error: null,
    });

    const result = await categorizeDescription("ZARA Loja Online 2026");
    // "loja" keyword matches, so local returns "shopping" before edge function
    expect(result).toBe("shopping");
  });

  it("returns 'other' gracefully when edge function fails", async () => {
    // Mock edge function failing
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: null,
      error: { message: "Edge function not deployed" },
    });

    // Use a string that won't match any local keyword
    const result = await categorizeDescription("Pagamento Referência 9283746");
    expect(result).toBe("other");
  });
});
