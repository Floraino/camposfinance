import { useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { type CategoryType } from "@/components/ui/CategoryBadge";

interface ImportCSVSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface ParsedTransaction {
  description: string;
  amount: number;
  category: CategoryType;
  payment_method: "pix" | "boleto" | "card" | "cash";
  status: "paid" | "pending";
  transaction_date: string;
  notes?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const categoryMapping: Record<string, CategoryType> = {
  // Portuguese mappings
  "alimentação": "food",
  "alimentacao": "food",
  "comida": "food",
  "mercado": "food",
  "supermercado": "food",
  "transporte": "transport",
  "uber": "transport",
  "combustível": "transport",
  "combustivel": "transport",
  "gasolina": "transport",
  "moradia": "bills",
  "aluguel": "bills",
  "casa": "bills",
  "condomínio": "bills",
  "condominio": "bills",
  "lazer": "leisure",
  "entretenimento": "leisure",
  "diversão": "leisure",
  "diversao": "leisure",
  "saúde": "health",
  "saude": "health",
  "farmácia": "health",
  "farmacia": "health",
  "médico": "health",
  "medico": "health",
  "educação": "education",
  "educacao": "education",
  "curso": "education",
  "escola": "education",
  "compras": "shopping",
  "roupas": "shopping",
  "vestuário": "shopping",
  "vestuario": "shopping",
  "contas": "bills",
  "conta": "bills",
  "luz": "bills",
  "água": "bills",
  "agua": "bills",
  "internet": "bills",
  "telefone": "bills",
  "outros": "other",
  "outro": "other",
  // English mappings
  "food": "food",
  "transport": "transport",
  "housing": "bills",
  "entertainment": "leisure",
  "health": "health",
  "education": "education",
  "shopping": "shopping",
  "bills": "bills",
  "leisure": "leisure",
  "other": "other",
};

const paymentMapping: Record<string, "pix" | "boleto" | "card" | "cash"> = {
  "pix": "pix",
  "boleto": "boleto",
  "cartão": "card",
  "cartao": "card",
  "card": "card",
  "crédito": "card",
  "credito": "card",
  "débito": "card",
  "debito": "card",
  "dinheiro": "cash",
  "cash": "cash",
  "espécie": "cash",
  "especie": "cash",
};

const statusMapping: Record<string, "paid" | "pending"> = {
  "pago": "paid",
  "paid": "paid",
  "pendente": "pending",
  "pending": "pending",
  "a pagar": "pending",
};

export function ImportCSVSheet({ isOpen, onClose, onImportComplete }: ImportCSVSheetProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseCSV = (content: string): string[][] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    return lines.map(line => {
      // Handle both comma and semicolon as separators
      const separator = line.includes(';') ? ';' : ',';
      return line.split(separator).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
    });
  };

  const parseDate = (dateStr: string): string => {
    if (!dateStr || dateStr.trim() === '') {
      // Return today's date if no date provided
      return new Date().toISOString().split('T')[0];
    }

    // Try different date formats
    const formats = [
      // DD/MM/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // DD-MM-YYYY
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      // YYYY-MM-DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      // DD/MM/YY
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let day, month, year;
        
        if (format === formats[2]) {
          // YYYY-MM-DD format
          [, year, month, day] = match;
        } else if (format === formats[3]) {
          // DD/MM/YY format
          [, day, month, year] = match;
          year = `20${year}`;
        } else {
          // DD/MM/YYYY or DD-MM-YYYY format
          [, day, month, year] = match;
        }
        
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }

    // If parsing fails, return today's date
    return new Date().toISOString().split('T')[0];
  };

  const parseAmount = (amountStr: string): number => {
    if (!amountStr) return 0;
    
    // Remove currency symbols and spaces
    let cleaned = amountStr.replace(/[R$\s]/g, '').trim();
    
    // Handle Brazilian format (1.234,56 -> 1234.56)
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
  };

  // Check if string looks like a monetary value
  const looksLikeAmount = (str: string): boolean => {
    if (!str) return false;
    const cleaned = str.replace(/[R$\s]/g, '').trim();
    // Check for number patterns with commas/dots
    return /^-?\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/.test(cleaned) || 
           /^-?\d+([.,]\d{1,2})?$/.test(cleaned);
  };

  // Check if string looks like a date
  const looksLikeDate = (str: string): boolean => {
    if (!str) return false;
    return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(str.trim()) ||
           /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(str.trim());
  };

  // Check if string looks like a category
  const looksLikeCategory = (str: string): boolean => {
    if (!str) return false;
    return Object.keys(categoryMapping).includes(str.toLowerCase().trim());
  };

  // Check if string looks like a payment method
  const looksLikePayment = (str: string): boolean => {
    if (!str) return false;
    return Object.keys(paymentMapping).includes(str.toLowerCase().trim());
  };

  // Check if string looks like a status
  const looksLikeStatus = (str: string): boolean => {
    if (!str) return false;
    return Object.keys(statusMapping).includes(str.toLowerCase().trim());
  };

  const detectColumnsByHeader = (headers: string[]): Record<string, number> => {
    const columnMap: Record<string, number> = {};
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    
    // Description column
    const descIdx = lowerHeaders.findIndex(h => 
      h.includes('descri') || h.includes('nome') || h.includes('name') || h === 'descrição' || h === 'description' ||
      h.includes('titulo') || h.includes('título') || h.includes('item') || h.includes('estabelecimento')
    );
    if (descIdx >= 0) columnMap.description = descIdx;
    
    // Amount column
    const amountIdx = lowerHeaders.findIndex(h => 
      h.includes('valor') || h.includes('amount') || h.includes('quantia') || h.includes('preço') || 
      h.includes('preco') || h.includes('total') || h.includes('price') || h.includes('custo')
    );
    if (amountIdx >= 0) columnMap.amount = amountIdx;
    
    // Category column
    const catIdx = lowerHeaders.findIndex(h => 
      h.includes('categ') || h.includes('tipo') || h.includes('type')
    );
    if (catIdx >= 0) columnMap.category = catIdx;
    
    // Date column
    const dateIdx = lowerHeaders.findIndex(h => 
      h.includes('data') || h.includes('date') || h.includes('dia') || h.includes('quando')
    );
    if (dateIdx >= 0) columnMap.date = dateIdx;
    
    // Payment method column
    const paymentIdx = lowerHeaders.findIndex(h => 
      h.includes('pagamento') || h.includes('payment') || h.includes('forma') || 
      h.includes('método') || h.includes('metodo') || h.includes('meio')
    );
    if (paymentIdx >= 0) columnMap.payment = paymentIdx;
    
    // Status column
    const statusIdx = lowerHeaders.findIndex(h => 
      h.includes('status') || h.includes('situação') || h.includes('situacao') || h.includes('estado')
    );
    if (statusIdx >= 0) columnMap.status = statusIdx;
    
    // Notes column
    const notesIdx = lowerHeaders.findIndex(h => 
      h.includes('nota') || h.includes('notes') || h.includes('obs') || 
      h.includes('comentário') || h.includes('comentario') || h.includes('detalhe')
    );
    if (notesIdx >= 0) columnMap.notes = notesIdx;
    
    return columnMap;
  };

  const detectColumnsByContent = (rows: string[][]): Record<string, number> => {
    if (rows.length < 2) return {};
    
    const columnMap: Record<string, number> = {};
    const dataRows = rows.slice(1, Math.min(6, rows.length)); // Analyze first 5 data rows
    const numCols = Math.max(...rows.map(r => r.length));
    
    const columnScores: { amount: number; date: number; category: number; payment: number; status: number; text: number }[] = [];
    
    for (let col = 0; col < numCols; col++) {
      const scores = { amount: 0, date: 0, category: 0, payment: 0, status: 0, text: 0 };
      
      for (const row of dataRows) {
        const cell = row[col] || '';
        if (!cell.trim()) continue;
        
        if (looksLikeAmount(cell)) scores.amount++;
        if (looksLikeDate(cell)) scores.date++;
        if (looksLikeCategory(cell)) scores.category++;
        if (looksLikePayment(cell)) scores.payment++;
        if (looksLikeStatus(cell)) scores.status++;
        // Text that doesn't match other patterns
        if (!looksLikeAmount(cell) && !looksLikeDate(cell) && cell.length > 2) {
          scores.text++;
        }
      }
      
      columnScores.push(scores);
    }
    
    // Find best column for each type (only if score > 0)
    const usedCols = new Set<number>();
    
    // Amount - highest amount score
    let bestAmountIdx = -1;
    let bestAmountScore = 0;
    columnScores.forEach((scores, idx) => {
      if (scores.amount > bestAmountScore) {
        bestAmountScore = scores.amount;
        bestAmountIdx = idx;
      }
    });
    if (bestAmountIdx >= 0 && bestAmountScore > 0) {
      columnMap.amount = bestAmountIdx;
      usedCols.add(bestAmountIdx);
    }
    
    // Date - highest date score
    let bestDateIdx = -1;
    let bestDateScore = 0;
    columnScores.forEach((scores, idx) => {
      if (!usedCols.has(idx) && scores.date > bestDateScore) {
        bestDateScore = scores.date;
        bestDateIdx = idx;
      }
    });
    if (bestDateIdx >= 0 && bestDateScore > 0) {
      columnMap.date = bestDateIdx;
      usedCols.add(bestDateIdx);
    }
    
    // Category - highest category score
    let bestCatIdx = -1;
    let bestCatScore = 0;
    columnScores.forEach((scores, idx) => {
      if (!usedCols.has(idx) && scores.category > bestCatScore) {
        bestCatScore = scores.category;
        bestCatIdx = idx;
      }
    });
    if (bestCatIdx >= 0 && bestCatScore > 0) {
      columnMap.category = bestCatIdx;
      usedCols.add(bestCatIdx);
    }
    
    // Payment - highest payment score
    let bestPayIdx = -1;
    let bestPayScore = 0;
    columnScores.forEach((scores, idx) => {
      if (!usedCols.has(idx) && scores.payment > bestPayScore) {
        bestPayScore = scores.payment;
        bestPayIdx = idx;
      }
    });
    if (bestPayIdx >= 0 && bestPayScore > 0) {
      columnMap.payment = bestPayIdx;
      usedCols.add(bestPayIdx);
    }
    
    // Status - highest status score
    let bestStatusIdx = -1;
    let bestStatusScore = 0;
    columnScores.forEach((scores, idx) => {
      if (!usedCols.has(idx) && scores.status > bestStatusScore) {
        bestStatusScore = scores.status;
        bestStatusIdx = idx;
      }
    });
    if (bestStatusIdx >= 0 && bestStatusScore > 0) {
      columnMap.status = bestStatusIdx;
      usedCols.add(bestStatusIdx);
    }
    
    // Description - highest text score among unused columns
    let bestTextIdx = -1;
    let bestTextScore = 0;
    columnScores.forEach((scores, idx) => {
      if (!usedCols.has(idx) && scores.text > bestTextScore) {
        bestTextScore = scores.text;
        bestTextIdx = idx;
      }
    });
    if (bestTextIdx >= 0 && bestTextScore > 0) {
      columnMap.description = bestTextIdx;
    }
    
    return columnMap;
  };

  const detectColumns = (rows: string[][]): Record<string, number> => {
    if (rows.length < 1) return {};
    
    const headers = rows[0];
    
    // First try to detect by header names
    const headerMap = detectColumnsByHeader(headers);
    
    // Then detect by content analysis
    const contentMap = detectColumnsByContent(rows);
    
    // Merge: header detection takes priority, content fills gaps
    const finalMap: Record<string, number> = { ...contentMap };
    
    for (const [key, value] of Object.entries(headerMap)) {
      if (value !== undefined) {
        finalMap[key] = value;
      }
    }
    
    return finalMap;
  };

  const parseRow = (row: string[], columnMap: Record<string, number>): ParsedTransaction | null => {
    // Get description - use first text-like column if not mapped
    let description = '';
    if (columnMap.description !== undefined) {
      description = row[columnMap.description] || '';
    } else {
      // Try to find a text column that's not used
      const usedCols = new Set(Object.values(columnMap));
      for (let i = 0; i < row.length; i++) {
        if (!usedCols.has(i) && row[i] && row[i].length > 2 && !looksLikeAmount(row[i]) && !looksLikeDate(row[i])) {
          description = row[i];
          break;
        }
      }
    }
    
    // Get amount
    let amountStr = '';
    if (columnMap.amount !== undefined) {
      amountStr = row[columnMap.amount] || '';
    } else {
      // Try to find an amount column
      for (let i = 0; i < row.length; i++) {
        if (row[i] && looksLikeAmount(row[i])) {
          amountStr = row[i];
          break;
        }
      }
    }
    
    // If no description, use first non-empty text cell
    if (!description) {
      const usedCols = new Set(Object.values(columnMap));
      for (let i = 0; i < row.length; i++) {
        if (!usedCols.has(i) && row[i] && row[i].trim().length > 0 && !looksLikeAmount(row[i])) {
          description = row[i];
          break;
        }
      }
    }
    
    // If still no description, generate one
    if (!description) {
      description = 'Transação importada';
    }
    
    const amount = parseAmount(amountStr);
    // Allow zero amount entries (some might be legitimate)
    if (!amountStr && amount === 0) {
      return null;
    }
    
    const categoryStr = columnMap.category !== undefined ? row[columnMap.category]?.toLowerCase() : '';
    const category = categoryMapping[categoryStr] || 'other';
    
    const dateStr = columnMap.date !== undefined ? row[columnMap.date] : '';
    const transaction_date = parseDate(dateStr);
    
    const paymentStr = columnMap.payment !== undefined ? row[columnMap.payment]?.toLowerCase() : '';
    const payment_method = paymentMapping[paymentStr] || 'pix';
    
    const statusStr = columnMap.status !== undefined ? row[columnMap.status]?.toLowerCase() : '';
    const status = statusMapping[statusStr] || 'paid';
    
    const notes = columnMap.notes !== undefined ? row[columnMap.notes] : undefined;
    
    return {
      description: description.substring(0, 255),
      amount: amount > 0 ? -Math.abs(amount) : amount, // Expenses are negative
      category,
      payment_method,
      status,
      transaction_date,
      notes: notes?.substring(0, 500),
    };
  };

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo CSV",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const content = await file.text();
      const rows = parseCSV(content);
      
      if (rows.length < 2) {
        throw new Error("Arquivo CSV vazio ou sem dados");
      }

      const columnMap = detectColumns(rows);
      
      // No longer require description/amount columns - we'll detect them from content
      if (Object.keys(columnMap).length === 0) {
        throw new Error("Não foi possível detectar as colunas do CSV");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const transactions: ParsedTransaction[] = [];
      const errors: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const parsed = parseRow(rows[i], columnMap);
        if (parsed) {
          transactions.push(parsed);
        } else if (rows[i].some(cell => cell.trim())) {
          errors.push(`Linha ${i + 1}: dados inválidos`);
        }
      }

      if (transactions.length === 0) {
        throw new Error("Nenhuma transação válida encontrada no arquivo");
      }

      // Insert transactions in batches
      const batchSize = 50;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize).map(tx => ({
          ...tx,
          user_id: user.id,
          is_recurring: false,
        }));

        const { error } = await supabase
          .from('transactions')
          .insert(batch);

        if (error) {
          failCount += batch.length;
          errors.push(`Erro ao inserir lote ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          successCount += batch.length;
        }
      }

      setResult({
        success: successCount,
        failed: failCount,
        errors: errors.slice(0, 5), // Show max 5 errors
      });

      if (successCount > 0) {
        toast({
          title: "Importação concluída!",
          description: `${successCount} transações importadas com sucesso.`,
        });
        onImportComplete?.();
      }
    } catch (error) {
      console.error("Error importing CSV:", error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro ao processar arquivo",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Importar CSV</h2>
          <Button variant="ghost" size="icon-sm" onClick={handleClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4 space-y-6 pb-safe">
          {/* Instructions */}
          <div className="glass-card p-4">
            <h3 className="font-semibold text-foreground mb-2">Detecção automática</h3>
            <p className="text-sm text-muted-foreground mb-3">
              O sistema detecta automaticamente as colunas do seu CSV:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Valor</strong> - detectado pelo formato numérico</li>
              <li><strong>Descrição</strong> - texto que não é valor ou data</li>
              <li><strong>Data</strong> - se não encontrada, usa data de hoje</li>
              <li><strong>Categoria</strong> - detectada automaticamente (ex: Alimentação)</li>
              <li><strong>Forma de pagamento</strong> - detectada se presente</li>
            </ul>
          </div>

          {/* Upload Area */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-4 hover:border-primary transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-sm font-medium text-foreground">Processando...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">Toque para selecionar arquivo</p>
                  <p className="text-sm text-muted-foreground">Formato CSV (.csv)</p>
                </div>
              </>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />

          {/* Result */}
          {result && (
            <div className="space-y-3">
              {result.success > 0 && (
                <div className="flex items-center gap-3 p-4 bg-success/10 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-success flex-shrink-0" />
                  <p className="text-sm text-success">
                    {result.success} transações importadas com sucesso
                  </p>
                </div>
              )}
              
              {result.failed > 0 && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0" />
                  <p className="text-sm text-destructive">
                    {result.failed} transações falharam
                  </p>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-sm font-medium text-foreground mb-2">Erros:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {result.errors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Example */}
          <div className="glass-card p-4">
            <h3 className="font-semibold text-foreground mb-2">Exemplos de CSV</h3>
            <p className="text-xs text-muted-foreground mb-2">Com colunas nomeadas:</p>
            <pre className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg overflow-x-auto mb-3">
{`Item;Total;Data
Supermercado;150,00;01/02/2026
Uber;25,50;
Conta de Luz;89,90;15/02/2026`}
            </pre>
            <p className="text-xs text-muted-foreground mb-2">Ou sem cabeçalho (detecta pelo conteúdo):</p>
            <pre className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg overflow-x-auto">
{`Supermercado;150,00
Farmácia;45,90
Cinema;32,00`}
            </pre>
          </div>

          {result && result.success > 0 && (
            <Button 
              variant="accent" 
              size="lg" 
              className="w-full"
              onClick={handleClose}
            >
              Concluído
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
