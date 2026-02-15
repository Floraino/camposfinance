import { describe, it, expect } from "vitest";
import {
  extractImportableTable,
  matrixToCsvString,
  normalizeString,
  isDatePtBr,
  parseMoneyPtBr,
  isLikelyFooterRow,
} from "@/services/tableExtraction";

// =============================================
// Helpers
// =============================================
describe("normalizeString", () => {
  it("remove acentos e lowercase", () => {
    expect(normalizeString("Descrição")).toBe("descricao");
    expect(normalizeString("Crédito")).toBe("credito");
  });
});

describe("isDatePtBr", () => {
  it("reconhece dd/mm/yyyy", () => {
    expect(isDatePtBr("10/01/2026")).toBe(true);
    expect(isDatePtBr("01-12-2025")).toBe(true);
  });
  it("rejeita texto", () => {
    expect(isDatePtBr("Supermercado")).toBe(false);
    expect(isDatePtBr("")).toBe(false);
  });
});

describe("parseMoneyPtBr", () => {
  it("parse formato BR", () => {
    expect(parseMoneyPtBr("1.234,56")).toBe(1234.56);
    expect(parseMoneyPtBr("-29,90")).toBe(-29.9);
  });
});

describe("isLikelyFooterRow", () => {
  it("detecta Total", () => {
    expect(isLikelyFooterRow(["Total", "1.000,00"])).toBe(true);
  });
  it("detecta Saldo Final", () => {
    expect(isLikelyFooterRow(["Saldo Final", "5.000,00"])).toBe(true);
  });
  it("não detecta linha de transação", () => {
    expect(isLikelyFooterRow(["10/01/2026", "Supermercado", "150,00"])).toBe(false);
  });
});

// =============================================
// extractImportableTable - Fixtures
// =============================================

describe("extractImportableTable", () => {
  it("planilha com cabeçalho acima + tabela + rodapé Total", () => {
    const matrix = [
      ["BANCO EXEMPLO"],
      ["Extrato de Conta Corrente"],
      ["Cliente: João Silva"],
      ["Agência: 1234 Conta: 56789-0"],
      ["Período: 01/01/2026 a 31/01/2026"],
      [],
      ["Data", "Descrição", "Docto", "Situação", "Crédito (R$)", "Débito (R$)", "Saldo (R$)"],
      ["05/01/2026", "Salário", "123", "Confirmado", "5.000,00", "", "5.000,00"],
      ["06/01/2026", "Supermercado XYZ", "124", "Confirmado", "", "350,50", "4.649,50"],
      ["07/01/2026", "Uber corrida", "125", "Confirmado", "", "25,90", "4.623,60"],
      [],
      ["Total do Período", "", "", "", "5.000,00", "376,40", ""],
    ];

    const result = extractImportableTable(matrix);
    expect(result.success).toBe(true);
    expect(result.table).toBeDefined();
    expect(result.table!.headerRowIndex).toBe(6);
    expect(result.table!.rows.length).toBe(3);
    expect(result.table!.columns).toContain("Data");
    expect(result.table!.columns).toContain("Descrição");
    expect(result.table!.rows[0][1]).toBe("Salário");
    expect(result.table!.rows[1][1]).toBe("Supermercado XYZ");
    expect(result.table!.rows[2][1]).toBe("Uber corrida");
  });

  it("planilha com header repetido no meio (quebra de página)", () => {
    const matrix = [
      ["Data", "Histórico", "Entrada (R$)", "Saída (R$)", "Saldo (R$)"],
      ["05/01/2026", "Saldo anterior", "", "", "1.000,00"],
      ["06/01/2026", "PIX Recebido", "500,00", "", "1.500,00"],
      ["Data", "Histórico", "Entrada (R$)", "Saída (R$)", "Saldo (R$)"],
      ["07/01/2026", "Supermercado", "", "150,00", "1.350,00"],
      ["08/01/2026", "Farmácia", "", "45,00", "1.305,00"],
    ];

    const result = extractImportableTable(matrix);
    expect(result.success).toBe(true);
    expect(result.table).toBeDefined();
    expect(result.table!.headerRowIndex).toBe(0);
    // Saldo anterior deve ser ignorado; header repetido deve ser ignorado
    expect(result.table!.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.table!.rows.some((r) => r[1] === "Supermercado")).toBe(true);
    expect(result.table!.rows.some((r) => r[1] === "Farmácia")).toBe(true);
  });

  it("planilha com coluna extra Categoria à direita", () => {
    const matrix = [
      ["Data", "Descrição", "Valor", "Categoria"],
      ["10/01/2026", "Supermercado", "200,00", "Alimentação"],
      ["11/01/2026", "Uber", "25,00", "Transporte"],
    ];

    const result = extractImportableTable(matrix);
    expect(result.success).toBe(true);
    expect(result.table!.columns).toContain("Data");
    expect(result.table!.columns).toContain("Descrição");
    expect(result.table!.columns).toContain("Valor");
    expect(result.table!.columns).toContain("Categoria");
    expect(result.table!.rows.length).toBe(2);
  });

  it("TXT com texto antes e depois do bloco de tabela", () => {
    const matrix = [
      ["EXTRATO BANCÁRIO"],
      ["Gerado em 15/02/2026"],
      [],
      ["Data", "Descrição", "Crédito (R$)", "Débito (R$)"],
      ["01/01/2026", "PIX João", "100,00", ""],
      ["02/01/2026", "Loja ABC", "", "50,00"],
      [],
      ["Fim do extrato"],
      ["Documento gerado eletronicamente"],
    ];

    const result = extractImportableTable(matrix);
    expect(result.success).toBe(true);
    expect(result.table!.headerRowIndex).toBe(3);
    expect(result.table!.rows.length).toBe(2);
    expect(result.table!.rows[0][1]).toBe("PIX João");
    expect(result.table!.rows[1][1]).toBe("Loja ABC");
  });

  it("retorna erro quando não encontra header válido", () => {
    const matrix = [
      ["Título qualquer"],
      ["Outro texto sem colunas de extrato"],
      ["Linha sem estrutura"],
    ];

    const result = extractImportableTable(matrix);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("retorna erro quando matriz vazia", () => {
    const result = extractImportableTable([]);
    expect(result.success).toBe(false);
  });
});

describe("matrixToCsvString", () => {
  it("converte matriz para CSV com ;", () => {
    const matrix = [
      ["Data", "Descrição", "Valor"],
      ["10/01/2026", "Supermercado", "150,00"],
    ];
    const csv = matrixToCsvString(matrix);
    expect(csv).toContain(";");
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("Data");
    expect(csv).toContain("Supermercado");
  });
});
