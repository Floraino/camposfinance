import { describe, it, expect } from "vitest";
import {
  parseLocalizedNumber,
  parseDate,
  inferCategory,
  inferPaymentMethod,
  generateImportHash,
  parseCSVWithMappings,
  isStandardFormat,
  parseStandardCSV,
  type ColumnMapping,
} from "@/services/csvImportService";

// =============================================
// 1) parseLocalizedNumber
// =============================================
describe("parseLocalizedNumber", () => {
  it("parses Brazilian format (1.234,56)", () => {
    expect(parseLocalizedNumber("1.234,56")).toBe(1234.56);
  });

  it("parses simple Brazilian comma decimal (123,45)", () => {
    expect(parseLocalizedNumber("123,45")).toBe(123.45);
  });

  it("parses US format (1,234.56)", () => {
    expect(parseLocalizedNumber("1,234.56")).toBe(1234.56);
  });

  it("parses R$ prefix", () => {
    expect(parseLocalizedNumber("R$ 1.234,56")).toBe(1234.56);
  });

  it("parses negative with minus", () => {
    expect(parseLocalizedNumber("-123,45")).toBe(-123.45);
  });

  it("parses negative with parentheses", () => {
    expect(parseLocalizedNumber("(123,45)")).toBe(-123.45);
  });

  it("returns null for empty/null", () => {
    expect(parseLocalizedNumber("")).toBe(null);
    expect(parseLocalizedNumber(null)).toBe(null);
  });

  it("returns null for text values", () => {
    expect(parseLocalizedNumber("Entrada (R$)")).toBe(null);
    expect(parseLocalizedNumber("Descrição")).toBe(null);
  });

  it("handles number input directly", () => {
    expect(parseLocalizedNumber(42.5)).toBe(42.5);
  });
});

// =============================================
// 2) parseDate
// =============================================
describe("parseDate", () => {
  it("parses DD/MM/YYYY", () => {
    expect(parseDate("15/01/2026")).toBe("2026-01-15");
  });

  it("parses DD-MM-YYYY", () => {
    expect(parseDate("15-01-2026")).toBe("2026-01-15");
  });

  it("parses YYYY-MM-DD", () => {
    expect(parseDate("2026-01-15")).toBe("2026-01-15");
  });

  it("parses DD/MM/YY (2-digit year)", () => {
    expect(parseDate("15/01/26")).toBe("2026-01-15");
  });

  it("returns null for empty/invalid", () => {
    expect(parseDate("")).toBe(null);
    expect(parseDate(null)).toBe(null);
    expect(parseDate("abc")).toBe(null);
  });
});

// =============================================
// 3) inferCategory
// =============================================
describe("inferCategory", () => {
  it("detects food from 'supermercado'", () => {
    expect(inferCategory("Supermercado Pão de Açúcar")).toBe("food");
  });

  it("detects transport from 'uber'", () => {
    expect(inferCategory("UBER *TRIP")).toBe("transport");
  });

  it("detects bills from 'internet'", () => {
    expect(inferCategory("Internet Vivo Fibra")).toBe("bills");
  });

  it("returns 'other' for unknown", () => {
    expect(inferCategory("XYZ Corp Payment")).toBe("other");
  });
});

// =============================================
// 4) inferPaymentMethod
// =============================================
describe("inferPaymentMethod", () => {
  it("detects pix", () => {
    expect(inferPaymentMethod("PIX Recebido")).toBe("pix");
  });

  it("detects card from 'cartão'", () => {
    expect(inferPaymentMethod("Cartão de Crédito")).toBe("card");
  });

  it("defaults to pix for unknown", () => {
    expect(inferPaymentMethod("Transferência")).toBe("pix");
  });
});

// =============================================
// 5) generateImportHash (deduplication)
// =============================================
describe("generateImportHash", () => {
  it("produces same hash for same data", () => {
    const a = generateImportHash("2026-01-15", -123.45, "Test");
    const b = generateImportHash("2026-01-15", -123.45, "Test");
    expect(a).toBe(b);
  });

  it("produces different hashes for different data", () => {
    const a = generateImportHash("2026-01-15", -123.45, "Test");
    const b = generateImportHash("2026-01-16", -123.45, "Test");
    expect(a).not.toBe(b);
  });
});

// =============================================
// 6) isStandardFormat
// =============================================
describe("isStandardFormat", () => {
  it("recognizes standard CSV header", () => {
    const csv = "data,descricao,tipo,valor,categoria,forma_pagamento,conta\n2026-01-15,Test,EXPENSE,100,other,pix,";
    expect(isStandardFormat(csv)).toBe(true);
  });

  it("rejects non-standard format", () => {
    const csv = "Date;Description;Amount\n2026-01-15;Test;100";
    expect(isStandardFormat(csv)).toBe(false);
  });
});

// =============================================
// 7) parseStandardCSV
// =============================================
describe("parseStandardCSV", () => {
  it("parses a valid standard CSV", () => {
    const csv = [
      "data,descricao,tipo,valor,categoria,forma_pagamento,conta",
      "2026-01-15,Supermercado,EXPENSE,350.50,food,card,Conta Corrente",
      "2026-01-16,Salário,INCOME,5000.00,other,pix,Conta Corrente",
    ].join("\n");

    const rows = parseStandardCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("OK");
    expect(rows[0].parsed?.description).toBe("Supermercado");
    expect(rows[0].parsed?.amount).toBe(-350.50); // EXPENSE → negative
    expect(rows[0].parsed?.type).toBe("EXPENSE");
    expect(rows[1].parsed?.amount).toBe(5000.00);
    expect(rows[1].parsed?.type).toBe("INCOME");
  });

  it("marks rows with invalid dates as ERROR", () => {
    const csv = [
      "data,descricao,tipo,valor,categoria,forma_pagamento,conta",
      ",Compra sem data,EXPENSE,100,other,pix,",
    ].join("\n");

    const rows = parseStandardCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ERROR");
  });
});

// =============================================
// 8) parseCSVWithMappings (Entrada/Saída)
// =============================================
describe("parseCSVWithMappings with Entrada/Saída", () => {
  it("parses Brazilian bank statement with separate columns", () => {
    const csv = [
      "Data;Histórico;Entrada (R$);Saída (R$);Saldo",
      "05/01/2026;Salário;5.000,00;;10.000,00",
      "06/01/2026;Supermercado;;350,50;9.649,50",
    ].join("\n");

    const mappings: ColumnMapping[] = [
      { csvColumn: "Data", csvIndex: 0, internalField: "date", confidence: 0.95 },
      { csvColumn: "Histórico", csvIndex: 1, internalField: "description", confidence: 0.95 },
      { csvColumn: "Entrada (R$)", csvIndex: 2, internalField: "entrada", confidence: 0.95 },
      { csvColumn: "Saída (R$)", csvIndex: 3, internalField: "saida", confidence: 0.95 },
    ];

    const rows = parseCSVWithMappings(csv, mappings, ";", true, "dd/MM/yyyy", true);
    expect(rows).toHaveLength(2);

    // First row: income (entrada)
    expect(rows[0].status).toBe("OK");
    expect(rows[0].parsed?.type).toBe("INCOME");
    expect(rows[0].parsed?.amount).toBe(5000.00); // positive for income
    expect(rows[0].parsed?.description).toBe("Salário");

    // Second row: expense (saída)
    expect(rows[1].status).toBe("OK");
    expect(rows[1].parsed?.type).toBe("EXPENSE");
    expect(rows[1].parsed?.amount).toBe(-350.50); // negative for expense
  });
});
