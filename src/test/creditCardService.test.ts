import { describe, it, expect } from "vitest";
import { getInvoiceKey, getStatementDateRange } from "@/services/creditCardService";

describe("getInvoiceKey", () => {
  it("returns current month when day <= closingDay", () => {
    expect(getInvoiceKey("2026-02-10", 10)).toBe("2026-02");
    expect(getInvoiceKey("2026-02-01", 10)).toBe("2026-02");
    expect(getInvoiceKey("2026-01-31", 31)).toBe("2026-01");
  });

  it("returns next month when day > closingDay", () => {
    expect(getInvoiceKey("2026-02-11", 10)).toBe("2026-03");
    expect(getInvoiceKey("2026-02-15", 10)).toBe("2026-03");
    expect(getInvoiceKey("2026-01-11", 10)).toBe("2026-02");
  });

  it("handles December -> January next year", () => {
    expect(getInvoiceKey("2026-12-31", 10)).toBe("2027-01");
    expect(getInvoiceKey("2026-12-11", 10)).toBe("2027-01");
  });

  it("handles invalid date string by returning slice", () => {
    expect(getInvoiceKey("2026-02", 10)).toBe("2026-02");
  });
});

describe("getStatementDateRange", () => {
  it("returns (closing_day prev month, closing_day this month] for a given YYYY-MM", () => {
    const card = { closing_day: 10 };
    const r = getStatementDateRange(card, "2026-02");
    expect(r.startDate).toBe("2026-01-10");
    expect(r.endDate).toBe("2026-02-10");
  });

  it("handles January (previous month is December previous year)", () => {
    const card = { closing_day: 5 };
    const r = getStatementDateRange(card, "2026-01");
    expect(r.startDate).toBe("2025-12-05");
    expect(r.endDate).toBe("2026-01-05");
  });

  it("pads closing_day to 2 digits", () => {
    const card = { closing_day: 5 };
    const r = getStatementDateRange(card, "2026-03");
    expect(r.startDate).toBe("2026-02-05");
    expect(r.endDate).toBe("2026-03-05");
  });
});
