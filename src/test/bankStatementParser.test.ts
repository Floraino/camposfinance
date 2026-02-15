import { describe, it, expect } from "vitest";
import {
  isSupportedFile,
  normalizeTxtToCsv,
  parseFileToCsvContent,
} from "@/services/bankStatementParser";
import * as XLSX from "xlsx";
import { parseCSVWithMappings, type ColumnMapping } from "@/services/csvImportService";

// =============================================
// 1) isSupportedFile
// =============================================
describe("isSupportedFile", () => {
  const createFile = (name: string, content = "test") =>
    new File([content], name, { type: "text/plain" });

  it("aceita .csv", () => {
    expect(isSupportedFile(createFile("a.csv"))).toEqual({ supported: true, format: "csv" });
  });

  it("aceita .txt", () => {
    expect(isSupportedFile(createFile("a.txt"))).toEqual({ supported: true, format: "txt" });
  });

  it("aceita .xls", () => {
    expect(isSupportedFile(createFile("a.xls"))).toEqual({ supported: true, format: "xls" });
  });

  it("aceita .xlsx", () => {
    expect(isSupportedFile(createFile("a.xlsx"))).toEqual({ supported: true, format: "xlsx" });
  });

  it("rejeita .pdf", () => {
    const r = isSupportedFile(createFile("a.pdf"));
    expect(r.supported).toBe(false);
    expect(r.error).toContain("não suportado");
  });

  it("rejeita extensão desconhecida", () => {
    expect(isSupportedFile(createFile("a.doc"))).toMatchObject({ supported: false });
  });
});

// =============================================
// 2) normalizeTxtToCsv - delimitado
// =============================================
describe("normalizeTxtToCsv", () => {
  it("converte TXT delimitado por ;", () => {
    const txt = [
      "Data;Descrição;Valor",
      "10/01/2026;Supermercado;150,00",
      "11/01/2026;Uber;25,50",
    ].join("\n");
    const csv = normalizeTxtToCsv(txt);
    expect(csv).toContain(";");
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain("Data");
    expect(csv).toContain("Supermercado");
  });

  it("converte TXT delimitado por tab", () => {
    const txt = "Data\tDescrição\tValor\n10/01/2026\tLoja\t100";
    const csv = normalizeTxtToCsv(txt);
    expect(csv).toContain(";");
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("converte TXT delimitado por vírgula", () => {
    const txt = "Data,Descrição,Valor\n10/01/2026,Compra,50";
    const csv = normalizeTxtToCsv(txt);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain(";");
  });

  it("converte TXT fixed-width (múltiplos espaços)", () => {
    const txt = [
      "Data    Descrição    Valor",
      "10/01   Supermercado 100,00",
    ].join("\n");
    const csv = normalizeTxtToCsv(txt);
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(1);
    expect(csv.trim().length).toBeGreaterThan(0);
  });

  it("retorna string vazia para entrada vazia", () => {
    expect(normalizeTxtToCsv("")).toBe("");
    expect(normalizeTxtToCsv("   \n\n   ")).toBe("");
  });
});

/** Cria File-like para testes (jsdom não implementa File.arrayBuffer/text) */
function createTestFile(
  content: string | ArrayBuffer | Uint8Array,
  name: string,
  mimeType: string
): File {
  const blob = new Blob([content], { type: mimeType });
  const ab = content instanceof ArrayBuffer
    ? content
    : content instanceof Uint8Array
      ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
      : new TextEncoder().encode(content as string).buffer;
  return {
    name,
    type: mimeType,
    size: blob.size,
    lastModified: Date.now(),
    arrayBuffer: () => Promise.resolve(ab),
    text: () => (typeof content === "string" ? Promise.resolve(content) : new Response(blob).text()),
    stream: () => blob.stream(),
    slice: (...args: Parameters<Blob["slice"]>) => blob.slice(...args),
  } as unknown as File;
}

// =============================================
// 3) parseFileToCsvContent - integração
// =============================================
describe("parseFileToCsvContent", () => {
  it("CSV: preserva conteúdo original", async () => {
    const content = "data;descricao;valor\n10/01/2026;Teste;100";
    const file = createTestFile(content, "test.csv", "text/csv");
    const { content: out, format } = await parseFileToCsvContent(file);
    expect(format).toBe("csv");
    expect(out).toBe(content);
  });

  it("TXT delimitado: converte para CSV-like", async () => {
    const txt = "Data;Descrição;Valor\n10/01/2026;Loja;50";
    const file = createTestFile(txt, "extrato.txt", "text/plain");
    const { content: out, format } = await parseFileToCsvContent(file);
    expect(format).toBe("txt");
    expect(out).toContain(";");
    expect(out).toContain("Data");
    expect(out).toContain("10/01/2026");
  });

  it("rejeita arquivo não suportado", async () => {
    const file = createTestFile("x", "a.pdf", "application/pdf");
    await expect(parseFileToCsvContent(file)).rejects.toThrow("não suportado");
  });

  it("TXT com extração: recorta tabela quando há cabeçalho/rodapé", async () => {
    const txt = [
      "BANCO;XYZ;EXTRATO; ",
      "Conta;12345; ; ",
      "Data;Descrição;Crédito (R$);Débito (R$)",
      "10/01/2026;Supermercado;;150,00",
      "11/01/2026;Uber;;25,50",
      "Total do Período;;;175,50",
    ].join("\n");
    const file = createTestFile(txt, "extrato.txt", "text/plain");
    const result = await parseFileToCsvContent(file);
    expect(result.format).toBe("txt");
    expect(result.extracted).toBe(true);
    expect(result.content).toContain("Supermercado");
    expect(result.content).toContain("10/01/2026");
    expect(result.content).not.toContain("Total do Período");
    expect(result.content).not.toContain("BANCO");
  });
});

// =============================================
// 4) Integração: TXT -> pipeline existente
// =============================================
describe("TXT integrado ao pipeline parseCSVWithMappings", () => {
  it("TXT delimitado gera conteúdo compatível com parseCSVWithMappings", () => {
    const txt = [
      "Data;Descrição;Valor",
      "10/01/2026;Supermercado;-150,00",
      "11/01/2026;Uber;-25,50",
    ].join("\n");
    const csvContent = normalizeTxtToCsv(txt);
    const mappings: ColumnMapping[] = [
      { csvColumn: "Data", csvIndex: 0, internalField: "date", confidence: 0.95 },
      { csvColumn: "Descrição", csvIndex: 1, internalField: "description", confidence: 0.95 },
      { csvColumn: "Valor", csvIndex: 2, internalField: "amount", confidence: 0.95 },
    ];
    const rows = parseCSVWithMappings(csvContent, mappings, ";", true, "dd/MM/yyyy", false);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("OK");
    expect(rows[0].parsed?.description).toBe("Supermercado");
    expect(rows[0].parsed?.amount).toBe(-150);
    expect(rows[0].parsed?.transaction_date).toBe("2026-01-10");
    expect(rows[1].parsed?.amount).toBe(-25.5);
  });
});

// =============================================
// 5) XLS/XLSX integrado ao pipeline
// =============================================
describe("XLS integrado ao pipeline", () => {
  it("XLSX gera conteúdo compatível com parseCSVWithMappings", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Data", "Descrição", "Valor"],
      ["10/01/2026", "Supermercado", -150],
      ["11/01/2026", "Uber", -25.5],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Extrato");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const file = createTestFile(buf, "extrato.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const { content, format } = await parseFileToCsvContent(file);
    expect(format).toBe("xlsx");
    expect(content).toContain(";");
    const mappings: ColumnMapping[] = [
      { csvColumn: "Data", csvIndex: 0, internalField: "date", confidence: 0.95 },
      { csvColumn: "Descrição", csvIndex: 1, internalField: "description", confidence: 0.95 },
      { csvColumn: "Valor", csvIndex: 2, internalField: "amount", confidence: 0.95 },
    ];
    const rows = parseCSVWithMappings(content, mappings, ";", true, "dd/MM/yyyy", false);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const okRows = rows.filter((r) => r.status === "OK");
    expect(okRows.length).toBe(2);
    expect(okRows[0].parsed?.description).toBe("Supermercado");
    expect(okRows[0].parsed?.amount).toBe(-150);
    expect(okRows[0].parsed?.type).toBe("EXPENSE");
  });
});
