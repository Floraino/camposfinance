import { describe, it, expect, vi, beforeEach } from "vitest";

// This test suite is intentionally lightweight.
// It verifies that "getUserHouseholds" never returns households without a membership.
// (Regression for the "Família Busca Pé" orphan household showing up in UI.)
import { getUserHouseholds } from "@/services/householdService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

describe("getUserHouseholds", () => {
  it("should only return households from household_members join", async () => {
    // Arrange: mock returns 3 membership rows, one with null household (orphan)
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn().mockResolvedValueOnce({
      data: [
        { household: { id: "h1", name: "A", created_by: "u", created_at: "", updated_at: "" } },
        { household: null },
        { household: { id: "h2", name: "B", created_by: "u", created_at: "", updated_at: "" } },
      ],
      error: null,
    });
    (supabase as any).from.mockReturnValueOnce(chain);

    // Act
    const households = await getUserHouseholds();

    // Assert: only 2 valid households returned
    expect(households.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect((supabase as any).from).toHaveBeenCalledWith("household_members");
  });
});
