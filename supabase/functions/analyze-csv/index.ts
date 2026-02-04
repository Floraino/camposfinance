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

interface AnalysisResult {
  separator: string;
  encoding: string;
  dateFormat: string;
  currencyFormat: string;
  hasHeader: boolean;
  columnMappings: ColumnMapping[];
  sampleRows: Record<string, string>[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { csvContent, sampleSize = 20 } = await req.json();

    if (!csvContent || typeof csvContent !== "string") {
      return new Response(
        JSON.stringify({ error: "CSV content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect separator
    const firstLines = csvContent.split(/\r?\n/).slice(0, 5).filter(l => l.trim());
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

    const headers = rows[0];
    const dataRows = rows.slice(1, Math.min(sampleSize + 1, rows.length));

    // Use AI to analyze the CSV structure
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      // Fallback to rule-based detection if no AI available
      return new Response(
        JSON.stringify(detectWithRules(headers, dataRows, separator)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sampleData = {
      headers,
      rows: dataRows.slice(0, 10),
    };

    const aiPrompt = `Analyze this Brazilian bank CSV file and detect column mappings.

CSV Sample:
Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleData.rows.slice(0, 5))}

Your task:
1. Identify which CSV column maps to each internal field:
   - amount (valor - look for currency patterns like "R$ 1.234,56" or "1234,56" or negative numbers)
   - date (data - look for date patterns like "dd/mm/yyyy" or "yyyy-mm-dd")
   - description (descrição - usually the longest text field, establishment names)
   - category (categoria - optional, may not exist)
   - payment_method (forma de pagamento - optional: pix, boleto, cartão, dinheiro)
   - notes (observações - optional)

2. Detect the date format used (e.g., "dd/MM/yyyy", "yyyy-MM-dd")
3. Detect the currency format (e.g., "R$ 1.234,56" or "1234.56")
4. Check if first row is a header (true/false)

Respond ONLY with valid JSON in this exact format:
{
  "dateFormat": "dd/MM/yyyy",
  "currencyFormat": "BR",
  "hasHeader": true,
  "mappings": [
    {"csvIndex": 0, "internalField": "date", "confidence": 0.95},
    {"csvIndex": 1, "internalField": "description", "confidence": 0.90},
    {"csvIndex": 2, "internalField": "amount", "confidence": 0.95}
  ]
}

Important:
- csvIndex is 0-based index of the CSV column
- confidence is 0.0 to 1.0
- Only include fields you're confident about
- For Brazilian banks, amount is often negative for expenses`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a CSV analysis expert. Respond only with valid JSON." },
          { role: "user", content: aiPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI API error, falling back to rules");
      return new Response(
        JSON.stringify(detectWithRules(headers, dataRows, separator)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    
    // Extract JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not parse AI response, falling back to rules");
      return new Response(
        JSON.stringify(detectWithRules(headers, dataRows, separator)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiAnalysis = JSON.parse(jsonMatch[0]);

    // Build column mappings with CSV column names
    const columnMappings: ColumnMapping[] = (aiAnalysis.mappings || []).map((m: any) => ({
      csvColumn: headers[m.csvIndex] || `Coluna ${m.csvIndex + 1}`,
      csvIndex: m.csvIndex,
      internalField: m.internalField,
      confidence: m.confidence,
    }));

    // Build sample rows with mapped data
    const sampleRowsMapped = dataRows.slice(0, 10).map(row => {
      const mapped: Record<string, string> = {};
      for (const mapping of columnMappings) {
        mapped[mapping.internalField] = row[mapping.csvIndex] || "";
      }
      // Add raw row for reference
      mapped._raw = row.join(" | ");
      return mapped;
    });

    const result: AnalysisResult = {
      separator,
      encoding: "UTF-8",
      dateFormat: aiAnalysis.dateFormat || "dd/MM/yyyy",
      currencyFormat: aiAnalysis.currencyFormat || "BR",
      hasHeader: aiAnalysis.hasHeader !== false,
      columnMappings,
      sampleRows: sampleRowsMapped,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing CSV:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fallback rule-based detection
function detectWithRules(headers: string[], dataRows: string[][], separator: string): AnalysisResult {
  const columnMappings: ColumnMapping[] = [];
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  // Detect by header names
  const descPatterns = ["descri", "nome", "name", "titulo", "título", "item", "estabelecimento", "historico", "histórico"];
  const amountPatterns = ["valor", "amount", "quantia", "preço", "preco", "total", "price", "custo", "saldo"];
  const datePatterns = ["data", "date", "dia", "quando", "vencimento"];
  const categoryPatterns = ["categ", "tipo", "type"];
  const paymentPatterns = ["pagamento", "payment", "forma", "método", "metodo", "meio"];

  for (let i = 0; i < lowerHeaders.length; i++) {
    const h = lowerHeaders[i];
    
    if (descPatterns.some(p => h.includes(p))) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "description", confidence: 0.9 });
    } else if (amountPatterns.some(p => h.includes(p))) {
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
  if (columnMappings.length === 0 || !columnMappings.find(m => m.internalField === "amount")) {
    const usedIndices = new Set(columnMappings.map(m => m.csvIndex));
    
    for (let i = 0; i < headers.length; i++) {
      if (usedIndices.has(i)) continue;
      
      const sampleValues = dataRows.slice(0, 5).map(r => r[i] || "");
      
      // Check if looks like amount
      const amountPattern = /^-?[R$\s]*\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/;
      const isAmount = sampleValues.filter(v => amountPattern.test(v.replace(/[R$\s]/g, "").trim())).length >= 3;
      
      if (isAmount && !columnMappings.find(m => m.internalField === "amount")) {
        columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "amount", confidence: 0.7 });
        usedIndices.add(i);
        continue;
      }
      
      // Check if looks like date
      const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
      const isDate = sampleValues.filter(v => datePattern.test(v.trim())).length >= 3;
      
      if (isDate && !columnMappings.find(m => m.internalField === "date")) {
        columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "date", confidence: 0.7 });
        usedIndices.add(i);
        continue;
      }
    }
    
    // Assign longest text column as description if not found
    if (!columnMappings.find(m => m.internalField === "description")) {
      let maxLen = 0;
      let descIdx = -1;
      
      for (let i = 0; i < headers.length; i++) {
        if (usedIndices.has(i)) continue;
        
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
  }

  const sampleRowsMapped = dataRows.slice(0, 10).map(row => {
    const mapped: Record<string, string> = {};
    for (const mapping of columnMappings) {
      mapped[mapping.internalField] = row[mapping.csvIndex] || "";
    }
    mapped._raw = row.join(" | ");
    return mapped;
  });

  return {
    separator,
    encoding: "UTF-8",
    dateFormat: "dd/MM/yyyy",
    currencyFormat: "BR",
    hasHeader: true,
    columnMappings,
    sampleRows: sampleRowsMapped,
  };
}
