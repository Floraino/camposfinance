import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ColumnMapping {
  csvColumn: string;
  csvIndex: number;
  internalField: string;
  confidence: number;
}

interface RowAnalysis {
  rowIndex: number;
  status: "OK" | "SKIPPED" | "ERROR";
  reason?: string;
  data?: Record<string, string>;
}

interface AnalysisResult {
  separator: string;
  encoding: string;
  dateFormat: string;
  currencyFormat: string;
  hasHeader: boolean;
  hasEntradaSaida: boolean; // New: indicates separate Entry/Exit columns
  columnMappings: ColumnMapping[];
  sampleRows: Record<string, string>[];
  rowAnalysis: RowAnalysis[]; // New: analysis of each row
}

// Patterns to detect non-transaction lines
const NON_TRANSACTION_PATTERNS = [
  /^ag[êe]ncia\s*[:\/-]/i,
  /^conta\s*[:\/-]/i,
  /^extrato\s+(gerado|de|para)/i,
  /^per[íi]odo\s*[:\/-]/i,
  /^saldo\s+(anterior|inicial|final)/i,
  /^data\s+de\s+(emiss[ãa]o|gera[çc][ãa]o)/i,
  /^cliente\s*[:\/-]/i,
  /^cpf\s*[:\/-]/i,
  /^cnpj\s*[:\/-]/i,
  /^\s*(data|date)\s*$/i, // Header row
  /^total\s+(do\s+per[íi]odo|geral)/i,
  /^(resumo|totais|consolidado)/i,
];

// Patterns to detect header rows
const HEADER_PATTERNS = [
  /^data$/i,
  /^descri[çc][ãa]o$/i,
  /^valor$/i,
  /^entrada\s*\(?\s*r?\$?\s*\)?$/i,
  /^sa[íi]da\s*\(?\s*r?\$?\s*\)?$/i,
  /^saldo\s*\(?\s*r?\$?\s*\)?$/i,
  /^hist[óo]rico$/i,
  /^lan[çc]amento$/i,
];

function isNonTransactionLine(cells: string[], rawLine: string): { skip: boolean; reason?: string } {
  const joinedCells = cells.join(" ").trim();
  const nonEmptyCells = cells.filter(c => c.trim() !== "");
  
  // Empty line
  if (nonEmptyCells.length === 0) {
    return { skip: true, reason: "Linha vazia" };
  }
  
  // Check against patterns
  for (const pattern of NON_TRANSACTION_PATTERNS) {
    if (pattern.test(joinedCells) || pattern.test(rawLine)) {
      return { skip: true, reason: "Linha informativa do extrato" };
    }
  }
  
  // Check if it's a header row (all cells match header patterns)
  const headerMatches = cells.filter(c => 
    HEADER_PATTERNS.some(p => p.test(c.trim()))
  );
  if (headerMatches.length >= 2 && headerMatches.length >= nonEmptyCells.length * 0.5) {
    return { skip: true, reason: "Linha de cabeçalho" };
  }
  
  // Very short line with no numbers
  if (nonEmptyCells.length === 1 && !/\d/.test(nonEmptyCells[0])) {
    return { skip: true, reason: "Linha sem dados de transação" };
  }
  
  return { skip: false };
}

function hasValidAmount(cells: string[]): boolean {
  const amountPattern = /^-?[R$€£¥\s]*\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/;
  return cells.some(c => {
    const cleaned = c.replace(/[R$€£¥\s]/gi, "").trim();
    return amountPattern.test(cleaned) || /^-?\d+([.,]\d{1,2})?$/.test(cleaned);
  });
}

function hasValidDate(cells: string[]): boolean {
  const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
  return cells.some(c => datePattern.test(c.trim()));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const traceId = crypto.randomUUID().slice(0, 8);
    console.log(`[analyze-csv][${traceId}] Request received`);

    // Auth check — require valid session token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { csvContent, sampleSize = 50 } = await req.json();

    if (!csvContent || typeof csvContent !== "string") {
      return new Response(
        JSON.stringify({ error: "CSV content is required", code: "MISSING_CSV" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate CSV size (max 5MB)
    if (csvContent.length > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ 
          error: "CSV muito grande", 
          code: "CSV_TOO_LARGE",
          details: `Tamanho: ${(csvContent.length / 1024 / 1024).toFixed(1)}MB. Máximo: 5MB.`
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-csv][${traceId}] CSV size: ${(csvContent.length / 1024).toFixed(0)}KB`);

    // Detect separator
    const firstLines = csvContent.split(/\r?\n/).slice(0, 10).filter(l => l.trim());
    const separatorCounts = { ",": 0, ";": 0, "\t": 0 };
    
    for (const line of firstLines) {
      separatorCounts[","] += (line.match(/,/g) || []).length;
      separatorCounts[";"] += (line.match(/;/g) || []).length;
      separatorCounts["\t"] += (line.match(/\t/g) || []).length;
    }
    
    const separator = Object.entries(separatorCounts)
      .sort(([, a], [, b]) => b - a)[0][0] as "," | ";" | "\t";

    // Parse CSV
    const allLines = csvContent.split(/\r?\n/).filter(l => l.trim());
    const rows = allLines.map(line => {
      return line.split(separator).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
    });

    if (rows.length < 2) {
      return new Response(
        JSON.stringify({ error: "CSV must have at least 2 rows" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect columns that are completely empty
    const numCols = Math.max(...rows.map(r => r.length));
    const emptyColumns = new Set<number>();
    for (let col = 0; col < numCols; col++) {
      const colValues = rows.map(r => r[col] || "").filter(v => v.trim() !== "");
      if (colValues.length <= 1) { // Only header or empty
        emptyColumns.add(col);
      }
    }

    // Detect if first row is header
    const firstRowAnalysis = isNonTransactionLine(rows[0], allLines[0]);
    const hasHeader = firstRowAnalysis.skip && firstRowAnalysis.reason === "Linha de cabeçalho";
    
    const headers = hasHeader ? rows[0] : rows[0].map((_, i) => `Coluna ${i + 1}`);
    const dataStartIndex = hasHeader ? 1 : 0;
    const dataRows = rows.slice(dataStartIndex, Math.min(sampleSize + dataStartIndex, rows.length));

    // Detect Entrada/Saída columns (Brazilian bank format)
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    const entradaIndex = lowerHeaders.findIndex(h => /entrada\s*\(?\s*r?\$?\s*\)?/i.test(h) || h === "entrada");
    const saidaIndex = lowerHeaders.findIndex(h => /sa[íi]da\s*\(?\s*r?\$?\s*\)?/i.test(h) || h === "saída" || h === "saida");
    const hasEntradaSaida = entradaIndex >= 0 && saidaIndex >= 0;

    // Use AI to analyze the CSV structure
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    let columnMappings: ColumnMapping[] = [];
    let dateFormat = "dd/MM/yyyy";
    
    if (GEMINI_API_KEY) {
      const sampleData = {
        headers,
        rows: dataRows.slice(0, 10),
        hasEntradaSaida,
        entradaIndex,
        saidaIndex,
      };

      const aiPrompt = `Analyze this Brazilian bank CSV file and detect column mappings.

CSV Sample:
Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleData.rows.slice(0, 5))}
Has separate Entrada/Saída columns: ${hasEntradaSaida}
${hasEntradaSaida ? `Entrada column index: ${entradaIndex}, Saída column index: ${saidaIndex}` : ""}

Your task:
1. Identify which CSV column maps to each internal field:
   - amount (valor - ONLY if single column with positive/negative values)
   - entrada (valor de entrada/receita - if separate column exists)
   - saida (valor de saída/despesa - if separate column exists)  
   - date (data - CRITICAL: look for columns with date patterns like "dd/mm/yyyy", "yyyy-mm-dd", "Data", "Data Mov.", "Data da transação", "Dt", "Movimentação")
   - description (descrição - usually the longest text field, establishment names, histórico)
   - category (categoria - optional, may not exist)
   - payment_method (forma de pagamento - optional: pix, boleto, cartão, dinheiro)
   - notes (observações - optional)

2. Detect the date format used (e.g., "dd/MM/yyyy", "yyyy-MM-dd")

CRITICAL DATE DETECTION RULES:
- The date column is the MOST IMPORTANT mapping - prioritize finding it
- Look for column names containing: "data", "date", "dt", "dia", "movimentação", "mov", "vencimento"
- Dates can appear as: "05/01/2026", "2026-01-05", "05-01-2026", "05/01/26"
- If a column has values matching date patterns (dd/mm/yyyy, yyyy-mm-dd), map it as "date"
- NEVER confuse date columns with description or other columns

IMPORTANT RULES:
- If the CSV has separate "Entrada" and "Saída" columns, map them as "entrada" and "saida" respectively
- Do NOT map "Saldo" or "Saldo do dia" columns - ignore them
- Do NOT map columns that look like headers repeated (e.g., "Saída(R$)" appearing as a value)
- If a column is mostly empty, do not map it

Respond ONLY with valid JSON in this exact format:
{
  "dateFormat": "dd/MM/yyyy",
  "mappings": [
    {"csvIndex": 0, "internalField": "date", "confidence": 0.95},
    {"csvIndex": 1, "internalField": "description", "confidence": 0.90},
    {"csvIndex": 2, "internalField": "entrada", "confidence": 0.95},
    {"csvIndex": 3, "internalField": "saida", "confidence": 0.95}
  ]
}`;

      try {
        console.log(`[analyze-csv][${traceId}] Calling Gemini for column mapping...`);
        const aiStartTime = Date.now();

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const aiResponse = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
            systemInstruction: { parts: [{ text: "You are a CSV analysis expert for Brazilian bank statements. Respond only with valid JSON." }] },
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
          }),
        });

        const aiDuration = Date.now() - aiStartTime;
        console.log(`[analyze-csv][${traceId}] Gemini response: status=${aiResponse.status}, duration=${aiDuration}ms`);

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiContent = aiData.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text).filter(Boolean).join("") || "";
          
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const aiAnalysis = JSON.parse(jsonMatch[0]);
              dateFormat = aiAnalysis.dateFormat || "dd/MM/yyyy";
              
              columnMappings = (aiAnalysis.mappings || [])
                .filter((m: any) => !emptyColumns.has(m.csvIndex))
                .map((m: any) => ({
                  csvColumn: headers[m.csvIndex] || `Coluna ${m.csvIndex + 1}`,
                  csvIndex: m.csvIndex,
                  internalField: m.internalField,
                  confidence: m.confidence,
                }));
              console.log(`[analyze-csv][${traceId}] Gemini mapped ${columnMappings.length} columns`);
            } catch (parseErr) {
              console.error(`[analyze-csv][${traceId}] Failed to parse Gemini JSON response:`, parseErr);
            }
          } else {
            console.warn(`[analyze-csv][${traceId}] Gemini response did not contain valid JSON`);
          }
        } else {
          const errText = await aiResponse.text();
          console.error(`[analyze-csv][${traceId}] Gemini API error ${aiResponse.status}: ${errText.substring(0, 200)}`);
        }
      } catch (aiError) {
        console.error(`[analyze-csv][${traceId}] Gemini API error, falling back to rules:`, aiError);
      }
    }
    
    // Fallback or supplement with rule-based detection
    if (columnMappings.length === 0) {
      console.log(`[analyze-csv][${traceId}] Using rule-based detection (AI unavailable or returned no mappings)`);
      columnMappings = detectWithRules(headers, dataRows, separator, emptyColumns, hasEntradaSaida, entradaIndex, saidaIndex);
    }

    // Analyze each row for transaction validity
    const rowAnalysis: RowAnalysis[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawLine = allLines[i];
      
      // Skip first row if it's a header
      if (i === 0 && hasHeader) {
        rowAnalysis.push({
          rowIndex: i + 1,
          status: "SKIPPED",
          reason: "Linha de cabeçalho",
        });
        continue;
      }
      
      const skipCheck = isNonTransactionLine(row, rawLine);
      if (skipCheck.skip) {
        rowAnalysis.push({
          rowIndex: i + 1,
          status: "SKIPPED",
          reason: skipCheck.reason,
        });
        continue;
      }
      
      // Check for valid amount
      const hasAmount = hasValidAmount(row);
      const hasDate = hasValidDate(row);
      
      if (!hasAmount && !hasDate) {
        rowAnalysis.push({
          rowIndex: i + 1,
          status: "SKIPPED",
          reason: "Sem valor e sem data reconhecidos",
        });
        continue;
      }
      
      if (!hasAmount) {
        // Check if it's entrada/saida format with empty values
        if (hasEntradaSaida) {
          const entradaVal = row[entradaIndex]?.trim() || "";
          const saidaVal = row[saidaIndex]?.trim() || "";
          if (!entradaVal && !saidaVal) {
            rowAnalysis.push({
              rowIndex: i + 1,
              status: "SKIPPED",
              reason: "Entrada e Saída vazias",
            });
            continue;
          }
        } else {
          rowAnalysis.push({
            rowIndex: i + 1,
            status: "ERROR",
            reason: "Valor não encontrado",
          });
          continue;
        }
      }
      
      rowAnalysis.push({
        rowIndex: i + 1,
        status: "OK",
      });
    }

    // Build sample rows with mapped data
    const sampleRowsMapped = dataRows.slice(0, 15).map((row, idx) => {
      const mapped: Record<string, string> = {};
      for (const mapping of columnMappings) {
        mapped[mapping.internalField] = row[mapping.csvIndex] || "";
      }
      mapped._raw = row.join(" | ");
      mapped._rowIndex = String(dataStartIndex + idx + 1);
      return mapped;
    });

    const result: AnalysisResult = {
      separator,
      encoding: "UTF-8",
      dateFormat,
      currencyFormat: "BR",
      hasHeader,
      hasEntradaSaida,
      columnMappings,
      sampleRows: sampleRowsMapped,
      rowAnalysis,
    };

    console.log(`[analyze-csv][${traceId}] Done: ${columnMappings.length} mappings, ${rowAnalysis.filter(r => r.status === "OK").length} valid rows, separator="${separator}"`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[analyze-csv] Unhandled error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido",
        code: "INTERNAL_ERROR" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Rule-based detection with Entrada/Saída support
function detectWithRules(
  headers: string[], 
  dataRows: string[][], 
  separator: string,
  emptyColumns: Set<number>,
  hasEntradaSaida: boolean,
  entradaIndex: number,
  saidaIndex: number
): ColumnMapping[] {
  const columnMappings: ColumnMapping[] = [];
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  // If has Entrada/Saída, map them directly
  if (hasEntradaSaida) {
    if (entradaIndex >= 0 && !emptyColumns.has(entradaIndex)) {
      columnMappings.push({ 
        csvColumn: headers[entradaIndex], 
        csvIndex: entradaIndex, 
        internalField: "entrada", 
        confidence: 0.95 
      });
    }
    if (saidaIndex >= 0 && !emptyColumns.has(saidaIndex)) {
      columnMappings.push({ 
        csvColumn: headers[saidaIndex], 
        csvIndex: saidaIndex, 
        internalField: "saida", 
        confidence: 0.95 
      });
    }
  }

  // Detect by header names
  const descPatterns = ["descri", "nome", "name", "titulo", "título", "item", "estabelecimento", "historico", "histórico", "lancamento", "lançamento"];
  const amountPatterns = ["valor", "amount", "quantia", "preço", "preco", "total", "price", "custo"];
  const datePatterns = ["data", "date", "dia", "quando", "vencimento"];
  const categoryPatterns = ["categ", "tipo", "type"];
  const paymentPatterns = ["pagamento", "payment", "forma", "método", "metodo", "meio"];
  const ignorePatterns = ["saldo", "balance"]; // Columns to ignore

  for (let i = 0; i < lowerHeaders.length; i++) {
    if (emptyColumns.has(i)) continue;
    if (columnMappings.some(m => m.csvIndex === i)) continue; // Already mapped
    
    const h = lowerHeaders[i];
    
    // Skip saldo columns
    if (ignorePatterns.some(p => h.includes(p))) {
      continue;
    }
    
    if (descPatterns.some(p => h.includes(p))) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "description", confidence: 0.9 });
    } else if (!hasEntradaSaida && amountPatterns.some(p => h.includes(p))) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "amount", confidence: 0.9 });
    } else if (datePatterns.some(p => h.includes(p))) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "date", confidence: 0.9 });
    } else if (categoryPatterns.some(p => h.includes(p))) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "category", confidence: 0.8 });
    } else if (paymentPatterns.some(p => h.includes(p))) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "payment_method", confidence: 0.8 });
    }
  }

  // If no mappings found, detect by content
  const usedIndices = new Set(columnMappings.map(m => m.csvIndex));
  
  for (let i = 0; i < headers.length; i++) {
    if (usedIndices.has(i) || emptyColumns.has(i)) continue;
    
    const sampleValues = dataRows.slice(0, 5).map(r => r[i] || "");
    
    // Check if looks like amount (and not already mapped entrada/saida)
    if (!hasEntradaSaida && !columnMappings.find(m => m.internalField === "amount")) {
      const amountPattern = /^-?[R$\s]*\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/;
      const isAmount = sampleValues.filter(v => amountPattern.test(v.replace(/[R$\s]/g, "").trim())).length >= 3;
      
      if (isAmount) {
        columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "amount", confidence: 0.7 });
        usedIndices.add(i);
        continue;
      }
    }
    
    // Check if looks like date
    if (!columnMappings.find(m => m.internalField === "date")) {
      const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
      const isDate = sampleValues.filter(v => datePattern.test(v.trim())).length >= 3;
      
      if (isDate) {
        columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "date", confidence: 0.7 });
        usedIndices.add(i);
        continue;
      }
    }
  }
  
  // Assign longest text column as description if not found
  if (!columnMappings.find(m => m.internalField === "description")) {
    let maxLen = 0;
    let descIdx = -1;
    
    for (let i = 0; i < headers.length; i++) {
      if (usedIndices.has(i) || emptyColumns.has(i)) continue;
      
      const avgLen = dataRows.slice(0, 5).reduce((sum, r) => sum + (r[i]?.length || 0), 0) / 5;
      if (avgLen > maxLen) {
        maxLen = avgLen;
        descIdx = i;
      }
    }
    
    if (descIdx >= 0) {
      columnMappings.push({ csvColumn: headers[descIdx], csvIndex: descIdx, internalField: "description", confidence: 0.6 });
    }
  }

  return columnMappings;
}
