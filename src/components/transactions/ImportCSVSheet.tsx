import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, ChevronRight, Download, RefreshCw, MinusCircle, ArrowDownCircle, Wand2, FileDown, FileCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useHousehold } from "@/hooks/useHousehold";
import { useProFeature } from "@/hooks/useProFeature";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";
import { ProBadge } from "@/components/paywall/ProBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  analyzeCSV,
  parseCSVWithMappings,
  importTransactions,
  downloadCSVTemplate,
  isStandardFormat,
  parseStandardCSV,
  convertBankStatement,
  downloadConvertedCSV,
  ensureCreditCardDateMapping,
  type CSVAnalysis,
  type ColumnMapping,
  type ParsedRow,
  type ImportResult,
  type ConvertedTransaction,
  type ConversionResult,
  type ImportTransactionsOptions,
} from "@/services/csvImportService";
import {
  parseFileToCsvContent,
  isSupportedFile,
} from "@/services/bankStatementParser";
import {
  inferInstitutionFromFilename,
  matchInstitutionToHousehold,
  type InstitutionMatchResult,
} from "@/services/inferInstitutionFromFilename";
import { getHouseholdAccounts, type Account } from "@/services/householdService";
import { getCreditCards, type CreditCard } from "@/services/creditCardService";
import { useHouseholdCategories } from "@/hooks/useHouseholdCategories";
import { getCategoryOptionsForPicker } from "@/lib/categoryResolvers";

interface ImportCSVSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type ImportStep = "upload" | "mapping" | "preview" | "importing" | "result" | "convert-preview";
type ImportMode = "standard" | "convert" | "credit_card";

const INTERNAL_FIELDS = [
  { value: "description", label: "Descrição" },
  { value: "amount", label: "Valor" },
  { value: "entrada", label: "Entrada (Receita)" },
  { value: "credito", label: "Crédito (R$)" },
  { value: "saida", label: "Saída (Despesa)" },
  { value: "debito", label: "Débito (R$)" },
  { value: "date", label: "Data" },
  { value: "category", label: "Categoria" },
  { value: "notes", label: "Observações" },
  { value: "ignore", label: "Ignorar" },
];

export function ImportCSVSheet({ isOpen, onClose, onImportComplete }: ImportCSVSheetProps) {
  const queryClient = useQueryClient();
  const { currentHousehold } = useHousehold();
  const { allowed: isPro } = useProFeature("CSV_IMPORT");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [mode, setMode] = useState<ImportMode>("standard");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // CSV data
  const [csvContent, setCsvContent] = useState<string>("");
  const [analysis, setAnalysis] = useState<CSVAnalysis | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Conversion data
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);

  // Import result
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Filename-based account/card inference
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const [inferredMatch, setInferredMatch] = useState<InstitutionMatchResult | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [defaultImportCategory, setDefaultImportCategory] = useState<string>("");

  const { categories: customCategories } = useHouseholdCategories(currentHousehold?.id);

  const resetState = useCallback(() => {
    setStep("upload");
    setMode("standard");
    setCsvContent("");
    setAnalysis(null);
    setColumnMappings([]);
    setParsedRows([]);
    setConversionResult(null);
    setImportResult(null);
    setImportProgress(0);
    setOriginalFilename(null);
    setInferredMatch(null);
    setSelectedAccountId(undefined);
    setSelectedCardId(undefined);
    setAccounts([]);
    setCards([]);
    setDefaultImportCategory("");
  }, []);

  // Load cards when mode is credit_card
  useEffect(() => {
    if (mode === "credit_card" && currentHousehold?.id && cards.length === 0) {
      getCreditCards(currentHousehold.id).then(setCards).catch(console.error);
    }
  }, [mode, currentHousehold?.id, cards.length]);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleFileSelect = async (file: File, importMode: ImportMode = "standard") => {
    const { supported, error } = isSupportedFile(file);
    if (!supported) {
      toast({
        title: "Arquivo inválido",
        description: error ?? "Use CSV, TXT, XLS ou XLSX",
        variant: "destructive",
      });
      return;
    }

    // File size limit (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "Arquivo muito grande",
        description: `Tamanho máximo: 5MB. Seu arquivo: ${(file.size / 1024 / 1024).toFixed(1)}MB`,
        variant: "destructive",
      });
      return;
    }

    if (!isPro) {
      setShowUpgradeModal(true);
      return;
    }

    setIsLoading(true);
    setMode(importMode);
    
    try {
      const { content, extracted } = await parseFileToCsvContent(file);
      setCsvContent(content);
      setOriginalFilename(file.name);

      if (extracted) {
        toast({
          title: "Tabela extraída",
          description: "Cabeçalho e rodapé ignorados automaticamente",
        });
      }

      // Infer account/card from filename and match to household (non-blocking)
      if (currentHousehold?.id) {
        (async () => {
          try {
            const inferred = inferInstitutionFromFilename(file.name);
            const [accs, cardList] = await Promise.all([
              getHouseholdAccounts(currentHousehold.id),
              getCreditCards(currentHousehold.id),
            ]);
            setAccounts(accs);
            setCards(cardList);
            const match = matchInstitutionToHousehold(inferred, accs, cardList);
            setInferredMatch(match);
            if (match.confidence === "high") {
              if (match.accountId) setSelectedAccountId(match.accountId);
              if (match.cardId) setSelectedCardId(match.cardId);
            } else {
              setSelectedAccountId(undefined);
              setSelectedCardId(undefined);
            }
            if (inferred && (match.matchedName || match.confidence !== "none")) {
              console.log("[CSV Import] CSV_IMPORT_INFERRED_INSTITUTION", {
                filename: file.name,
                inferredName: inferred.name,
                kind: inferred.kind,
                matchedId: match.accountId ?? match.cardId,
                confidence: match.confidence,
              });
            }
          } catch (e) {
            console.warn("[CSV Import] Infer institution failed:", e);
          }
        })();
      }

      if (importMode === "convert") {
        // Convert bank statement mode
        const result = await convertBankStatement(content);
        setConversionResult(result);
        setStep("convert-preview");
      } else if (importMode === "credit_card") {
        // Credit card import mode - same flow as standard but will require card selection
        if (isStandardFormat(content)) {
          // Skip AI analysis, parse directly (credit_card: positivos = gasto, negativos descartados)
          const parsed = parseStandardCSV(content, "credit_card");
          setParsedRows(parsed);
          setStep("preview");
        } else {
          const analysisResult = await analyzeCSV(content);
          setAnalysis(analysisResult);
          const mappingsWithDate = ensureCreditCardDateMapping(
            content,
            analysisResult.columnMappings,
            analysisResult.separator,
            analysisResult.hasHeader
          );
          setColumnMappings(mappingsWithDate);
          setStep("mapping");
        }
      } else {
        // Standard mode - check if it's already in standard format
        if (isStandardFormat(content)) {
          // Skip AI analysis, parse directly
          const parsed = parseStandardCSV(content, "bank_account");
          setParsedRows(parsed);
          setStep("preview");
          toast({
            title: "Formato padrão detectado",
            description: "Pulando etapa de mapeamento",
          });
        } else {
          // Analyze CSV with AI
          let result = await analyzeCSV(content);
          // Normalize analysis for conta corrente: Edge (or fallback) may omit amount or set hasHeader false
          const firstLine = content.split(/\r?\n/).filter(l => l.trim())[0] ?? "";
          const sep = result.separator;
          const firstRowCells = firstLine.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
          const firstCellLower = firstRowCells[0]?.toLowerCase() ?? "";
          const looksLikeHeader = /^data$|^date$|^dia$|^dt$/.test(firstCellLower) || firstRowCells.some(c => /^(data|descri|valor|hist|lan[cç]amento)/i.test(c?.trim() ?? ""));
          let hasHeader = result.hasHeader;
          if (!hasHeader && looksLikeHeader) hasHeader = true;
          let columnMappingsResult = result.columnMappings;
          const hasAmountMapping = columnMappingsResult.some(m => m.internalField === "amount" || m.internalField === "debito" || m.internalField === "credito");
          if (!hasAmountMapping && firstRowCells.length > 0) {
            const valorColIdx = firstRowCells.findIndex(c => /valor\s*\(?\s*r?\$?\)?|amount|valor\s*\(/i.test((c ?? "").trim()));
            if (valorColIdx >= 0) {
              columnMappingsResult = [
                ...columnMappingsResult.filter(m => m.internalField !== "amount"),
                { csvColumn: firstRowCells[valorColIdx] || `Coluna ${valorColIdx + 1}`, csvIndex: valorColIdx, internalField: "amount" as const, confidence: 0.9 },
              ];
            }
          }
          result = { ...result, hasHeader, columnMappings: columnMappingsResult };
          setAnalysis(result);
          setColumnMappings(result.columnMappings);
          setStep("mapping");
        }
      }
    } catch (error) {
      console.error("Error analyzing CSV:", error);
      toast({
        title: "Erro ao analisar arquivo",
        description: error instanceof Error ? error.message : "Não foi possível processar o arquivo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConvertAndImport = async () => {
    if (!conversionResult || !currentHousehold?.id) return;

    // Convert to ParsedRow format for importing
    const parsed: ParsedRow[] = conversionResult.converted
      .filter(c => c.status === "OK")
      .map((c, idx) => ({
        rowIndex: idx + 1,
        raw: c.originalRow,
        status: "OK" as const,
        parsed: {
          description: c.descricao,
          amount: -Math.abs(c.valor),
          type: "EXPENSE",
          category: c.categoria as any,
          status: "paid" as const,
          transaction_date: c.data,
          import_hash: `${c.data}|${c.valor}|${c.descricao}`.substring(0, 50),
        },
        errors: [],
      }));

    setParsedRows(parsed);
    setStep("preview");
  };

  const handleDownloadConverted = () => {
    if (!conversionResult) return;
    downloadConvertedCSV(conversionResult.converted);
    toast({
      title: "CSV baixado",
      description: "O arquivo convertido foi baixado com sucesso",
    });
  };

  const updateMapping = (csvIndex: number, newField: string) => {
    setColumnMappings(prev => {
      // Remove any existing mapping for this field (except 'ignore')
      const filtered = prev.filter(m => m.csvIndex !== csvIndex);
      
      if (newField === "ignore") {
        return filtered;
      }

      // Remove any other column mapped to the same field
      const withoutDuplicates = filtered.filter(m => m.internalField !== newField);

      // Add new mapping
      const header = analysis?.sampleRows[0]?._raw?.split(analysis.separator)[csvIndex] || `Coluna ${csvIndex + 1}`;
      return [
        ...withoutDuplicates,
        {
          csvColumn: header,
          csvIndex,
          internalField: newField,
          confidence: 1.0,
        },
      ];
    });
  };

  const handleContinueToPreview = async () => {
    if (!analysis || !csvContent) return;

    setIsLoading(true);
    try {
      const sourceType = mode === "credit_card" ? "credit_card" : "bank_account";
      const parsed = parseCSVWithMappings(
        csvContent,
        columnMappings,
        analysis.separator,
        analysis.hasHeader,
        analysis.dateFormat,
        analysis.hasEntradaSaida,
        sourceType,
        defaultImportCategory || undefined
      );
      setParsedRows(parsed);
      setStep("preview");
    } catch (error) {
      console.error("Error parsing CSV:", error);
      toast({
        title: "Erro ao processar arquivo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!currentHousehold?.id || parsedRows.length === 0) return;

    const validRows = parsedRows.filter(r => r.parsed !== null);
    if (validRows.length === 0) {
      toast({
        title: "Nenhuma transação válida",
        description: "Corrija os erros antes de importar",
        variant: "destructive",
      });
      return;
    }

    // Validate credit card selection for credit_card mode
    if (mode === "credit_card") {
      const creditCardId = selectedCardId ?? (inferredMatch?.confidence === "high" && inferredMatch?.cardId ? inferredMatch.cardId : undefined);
      if (!creditCardId) {
        toast({
          title: "Cartão obrigatório",
          description: "Selecione um cartão de crédito para importar o extrato",
          variant: "destructive",
        });
        return;
      }
    }

    setStep("importing");
    setImportProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Determine sourceType based on mode
      const sourceType = mode === "credit_card" ? "credit_card" : "bank_account";
      
      // For credit_card mode: credit_card_id is required, account_id must be null
      // For bank_account mode: account_id is optional, credit_card_id should be null
      const accountId = mode === "credit_card" 
        ? null 
        : (selectedAccountId ??
          (inferredMatch?.confidence === "high" && inferredMatch?.accountId
            ? inferredMatch.accountId
            : undefined));
      const creditCardId = mode === "credit_card"
        ? (selectedCardId ?? (inferredMatch?.confidence === "high" && inferredMatch?.cardId ? inferredMatch.cardId : undefined))
        : null;
      
      const importOptions: ImportTransactionsOptions = {
        originalFilename: originalFilename ?? undefined,
        accountId: accountId ?? null,
        creditCardId: creditCardId ?? null,
        sourceType: sourceType,
      };

      const result = await importTransactions(
        currentHousehold.id,
        parsedRows,
        skipDuplicates,
        importOptions
      );

      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResult(result);
      setStep("result");

      if (result.imported > 0) {
        if (currentHousehold?.id) {
          queryClient.invalidateQueries({ queryKey: ["accounts", currentHousehold.id] });
        }
        const linkedMsg =
          mode === "credit_card" && creditCardId && cards.find((c) => c.id === creditCardId)
            ? ` Vinculadas ao cartão ${cards.find((c) => c.id === creditCardId)?.name}.`
            : mode !== "credit_card" && accountId && accounts.find((a) => a.id === accountId)
              ? ` Vinculadas à conta ${accounts.find((a) => a.id === accountId)?.name}.`
              : mode !== "credit_card" && creditCardId && cards.find((c) => c.id === creditCardId)
                ? ` Vinculadas ao cartão ${cards.find((c) => c.id === creditCardId)?.name}.`
                : "";
        toast({
          title: "Importação concluída!",
          description: `${result.imported} transações importadas com sucesso.${linkedMsg}`,
        });
        onImportComplete?.();
      }
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  const downloadErrorReport = () => {
    if (!importResult) return;

    const report = importResult.errors.map(e => `Linha ${e.row}: ${e.reason}`).join("\n");
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erros_importacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const validCount = parsedRows.filter(r => r.status === "OK").length;
  const skippedCount = parsedRows.filter(r => r.status === "SKIPPED").length;
  const errorCount = parsedRows.filter(r => r.status === "ERROR").length;
  const expenseCount = parsedRows.filter(r => r.status === "OK").length;
  const ignoredIncomeCount = parsedRows.filter(
    r => r.status === "SKIPPED" && r.reason?.includes("Entrada ignorada")
  ).length;
  const ignoredNegativeCount = parsedRows.filter(
    r => r.status === "SKIPPED" && r.reason?.includes("Valor negativo descartado")
  ).length;

  // Get available columns from CSV
  const csvHeaders = analysis?.sampleRows[0]?._raw?.split(analysis.separator).map((h, i) => ({
    index: i,
    name: h.trim().replace(/^["']|["']$/g, '') || `Coluna ${i + 1}`,
  })) || [];

  return (
    <>
      <div className="fixed inset-0 z-50 animate-fade-in">
        <div 
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={handleClose}
        />
        
        <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[95vh] overflow-y-auto">
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-muted rounded-full" />
          </div>
          
            <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {mode === "credit_card" ? "Importar Extrato (Cartão de Crédito)" : "Importar Extrato"}
              </h2>
              <ProBadge show={!isPro} />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={handleClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <div className="p-4 space-y-4 pb-safe">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className={step === "upload" ? "text-primary font-medium" : "text-muted-foreground"}>
                1. Upload
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className={step === "mapping" || step === "convert-preview" ? "text-primary font-medium" : "text-muted-foreground"}>
                2. {mode === "convert" ? "Conversão" : mode === "credit_card" ? "Mapeamento (Cartão)" : "Mapeamento"}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className={step === "preview" ? "text-primary font-medium" : "text-muted-foreground"}>
                3. Revisão
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className={step === "result" || step === "importing" ? "text-primary font-medium" : "text-muted-foreground"}>
                4. Resultado
              </span>
            </div>

            {/* Step 1: Upload */}
            {step === "upload" && (
              <>
                {/* Download Template Button */}
                <div className="glass-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <FileDown className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">Modelo CSV Padrão</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        Baixe o modelo padrão do app para preencher suas transações de forma estruturada.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => downloadCSVTemplate("bank_account")}>
                          <Download className="w-4 h-4 mr-2" />
                          Modelo Conta Corrente
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadCSVTemplate("credit_card")}>
                          <Download className="w-4 h-4 mr-2" />
                          Modelo Cartão de Crédito
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Three import options */}
                <div className="grid gap-3">
                  {/* Standard Import - Bank Account */}
                  <button
                    onClick={() => {
                      setMode("standard");
                      fileInputRef.current?.click();
                    }}
                    disabled={isLoading}
                    className="w-full border-2 border-dashed border-border rounded-xl p-6 flex items-center gap-4 hover:border-primary transition-colors disabled:opacity-50 text-left"
                  >
                    {isLoading && mode === "standard" ? (
                      <>
                        <Loader2 className="w-10 h-10 text-primary animate-spin flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Analisando arquivo...</p>
                          <p className="text-sm text-muted-foreground">Detectando formato automaticamente</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <FileSpreadsheet className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Importar Extrato (Conta Corrente)</p>
                          <p className="text-sm text-muted-foreground">
                            CSV, TXT, XLS ou XLSX — extrato de banco
                          </p>
                        </div>
                      </>
                    )}
                  </button>

                  {/* Credit Card Import */}
                  <button
                    onClick={() => {
                      setMode("credit_card");
                      fileInputRef.current?.click();
                    }}
                    disabled={isLoading}
                    className="w-full border-2 border-dashed border-purple-500/50 rounded-xl p-6 flex items-center gap-4 hover:border-purple-500 transition-colors disabled:opacity-50 text-left bg-purple-500/5"
                  >
                    {isLoading && mode === "credit_card" ? (
                      <>
                        <Loader2 className="w-10 h-10 text-purple-500 animate-spin flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Analisando extrato...</p>
                          <p className="text-sm text-muted-foreground">Detectando formato automaticamente</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                          <FileSpreadsheet className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Importar Extrato (Cartão de Crédito)</p>
                          <p className="text-sm text-muted-foreground">
                            CSV, TXT, XLS ou XLSX — fatura de cartão
                          </p>
                        </div>
                      </>
                    )}
                  </button>

                  {/* Convert Bank Statement */}
                  <button
                    onClick={() => {
                      setMode("convert");
                      fileInputRef.current?.click();
                    }}
                    disabled={isLoading}
                    className="w-full border-2 border-dashed border-accent/50 rounded-xl p-6 flex items-center gap-4 hover:border-accent transition-colors disabled:opacity-50 text-left bg-accent/5"
                  >
                    {isLoading && mode === "convert" ? (
                      <>
                        <Loader2 className="w-10 h-10 text-accent animate-spin flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Convertendo extrato...</p>
                          <p className="text-sm text-muted-foreground">Usando IA para mapear colunas</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <Wand2 className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground flex items-center gap-2">
                            Conversor Inteligente
                            <Badge variant="secondary" className="text-xs">IA</Badge>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Converte extrato de qualquer banco para o formato padrão
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileSelect(e.target.files[0], mode);
                    }
                  }}
                />
              </>
            )}

            {/* Step: Convert Preview */}
            {step === "convert-preview" && conversionResult && (
              <>
                <div className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileCheck className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Extrato Convertido</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    O extrato bancário foi analisado e convertido para o formato padrão do app.
                  </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="glass-card p-2 text-center">
                    <p className="text-xl font-bold text-primary">{conversionResult.summary.ok}</p>
                    <p className="text-xs text-muted-foreground">Convertidas</p>
                  </div>
                  <div className="glass-card p-2 text-center">
                    <p className="text-xl font-bold text-muted-foreground">{conversionResult.summary.skipped}</p>
                    <p className="text-xs text-muted-foreground">Ignoradas</p>
                  </div>
                  <div className="glass-card p-2 text-center">
                    <p className="text-xl font-bold text-destructive">{conversionResult.summary.errors}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 text-sm">
                  {conversionResult.summary.totalExpense > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <ArrowDownCircle className="w-5 h-5" />
                      <span className="font-medium">
                        R$ {conversionResult.summary.totalExpense.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">despesas</span>
                    </div>
                  )}
                </div>

                {/* Converted Transactions Table */}
                <Tabs defaultValue="ok" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="ok" className="flex-1">
                      OK ({conversionResult.summary.ok})
                    </TabsTrigger>
                    <TabsTrigger value="skipped" className="flex-1">
                      Ignoradas ({conversionResult.summary.skipped})
                    </TabsTrigger>
                    <TabsTrigger value="errors" className="flex-1">
                      Erros ({conversionResult.summary.errors})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="ok" className="mt-2">
                    <div className="glass-card p-2 max-h-[200px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conversionResult.converted.filter(c => c.status === "OK").slice(0, 20).map((tx, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs">{tx.data}</TableCell>
                              <TableCell className="text-sm truncate max-w-[120px]">{tx.descricao}</TableCell>
                              <TableCell className="text-right text-sm font-medium text-destructive">
                                -R$ {tx.valor.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="skipped" className="mt-2">
                    <div className="glass-card p-2 max-h-[200px] overflow-y-auto">
                      {conversionResult.summary.skipped === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma linha ignorada</p>
                      ) : (
                        <ul className="space-y-1">
                          {conversionResult.converted.filter(c => c.status === "SKIPPED").slice(0, 10).map((tx, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                              <span className="text-foreground">{tx.originalRow.substring(0, 50)}...</span>
                              <br />
                              <Badge variant="secondary" className="mt-1 text-xs">
                                <MinusCircle className="w-3 h-3 mr-1" />
                                {tx.reason}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="errors" className="mt-2">
                    <div className="glass-card p-2 max-h-[200px] overflow-y-auto">
                      {conversionResult.summary.errors === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhum erro</p>
                      ) : (
                        <ul className="space-y-1">
                          {conversionResult.converted.filter(c => c.status === "ERROR").slice(0, 10).map((tx, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground p-2 bg-destructive/10 rounded">
                              <span className="text-foreground">{tx.originalRow.substring(0, 50)}...</span>
                              <br />
                              <Badge variant="destructive" className="mt-1 text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {tx.reason}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleDownloadConverted} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Baixar CSV Convertido
                  </Button>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
                    Voltar
                  </Button>
                  <Button 
                    variant="accent" 
                    onClick={handleConvertAndImport} 
                    className="flex-1"
                    disabled={conversionResult.summary.ok === 0}
                  >
                    Importar {conversionResult.summary.ok} transações
                  </Button>
                </div>
              </>
            )}

            {/* Step 2: Mapping */}
            {step === "mapping" && analysis && (
              <>
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-foreground mb-2">Mapeamento Detectado</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Separador: <Badge variant="secondary">{analysis.separator === ";" ? "ponto e vírgula (;)" : analysis.separator === "," ? "vírgula (,)" : "tab"}</Badge>
                    {" • "}Formato de data: <Badge variant="secondary">{analysis.dateFormat}</Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Revise e ajuste o mapeamento se necessário:
                  </p>
                </div>

                <div className="space-y-3">
                  {csvHeaders.map((header) => {
                    const currentMapping = columnMappings.find(m => m.csvIndex === header.index);
                    const currentValue = currentMapping?.internalField || "ignore";

                    return (
                      <div key={header.index} className="flex items-center gap-3">
                        <div className="flex-1 truncate">
                          <span className="text-sm font-medium text-foreground">{header.name}</span>
                          {currentMapping && currentMapping.confidence < 0.8 && (
                            <Badge variant="outline" className="ml-2 text-xs">Baixa confiança</Badge>
                          )}
                        </div>
                        <Select value={currentValue} onValueChange={(val) => updateMapping(header.index, val)}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INTERNAL_FIELDS.map((field) => (
                              <SelectItem 
                                key={field.value} 
                                value={field.value}
                                disabled={field.value !== "ignore" && field.value !== currentValue && columnMappings.some(m => m.internalField === field.value)}
                              >
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {/* Sample Preview */}
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-foreground mb-2">Prévia (primeiras 3 linhas)</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columnMappings.map((m) => (
                            <TableHead key={m.csvIndex}>{INTERNAL_FIELDS.find(f => f.value === m.internalField)?.label || m.internalField}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.sampleRows.slice(0, 3).map((row, idx) => (
                          <TableRow key={idx}>
                            {columnMappings.map((m) => (
                              <TableCell key={m.csvIndex} className="text-sm">
                                {row[m.internalField] || "-"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="glass-card p-4">
                  <h4 className="font-semibold text-foreground mb-2">Categoria padrão</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Usada quando a coluna Categoria não está mapeada ou o valor está vazio.
                  </p>
                  <Select value={defaultImportCategory || "infer"} onValueChange={(v) => setDefaultImportCategory(v === "infer" ? "" : v)}>
                    <SelectTrigger className="w-full max-w-[240px]">
                      <SelectValue placeholder="Inferir pela descrição" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="infer">Inferir pela descrição</SelectItem>
                      {getCategoryOptionsForPicker(customCategories).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {mode === "credit_card" && !columnMappings.some(m => m.internalField === "date") && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span>Selecione a coluna de <strong>Data</strong> no mapeamento para continuar (ou use a detecção automática).</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
                    Voltar
                  </Button>
                  <Button 
                    variant="accent" 
                    onClick={handleContinueToPreview} 
                    className="flex-1"
                    disabled={
                      isLoading ||
                      !columnMappings.some(m => ["amount", "entrada", "saida", "credito", "debito"].includes(m.internalField)) ||
                      (mode === "credit_card" && !columnMappings.some(m => m.internalField === "date"))
                    }
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Continuar
                  </Button>
                </div>
              </>
            )}

            {/* Step 3: Preview */}
            {step === "preview" && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="glass-card p-2 text-center">
                    <p className="text-xl font-bold text-primary">{validCount}</p>
                    <p className="text-xs text-muted-foreground">OK</p>
                  </div>
                  <div className="glass-card p-2 text-center">
                    <p className="text-xl font-bold text-muted-foreground">{skippedCount}</p>
                    <p className="text-xs text-muted-foreground">Ignoradas</p>
                  </div>
                  <div className="glass-card p-2 text-center">
                    <p className="text-xl font-bold text-destructive">{errorCount}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                </div>

                {validCount > 0 && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-destructive">
                      <ArrowDownCircle className="w-4 h-4" />
                      <span>{expenseCount} despesas</span>
                    </div>
                    {(mode === "credit_card" ? ignoredNegativeCount : ignoredIncomeCount) > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MinusCircle className="w-4 h-4" />
                        <span>
                          {mode === "credit_card"
                            ? `Ignorados (valores negativos): ${ignoredNegativeCount}`
                            : `Ignorados (entradas): ${ignoredIncomeCount}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="skipDuplicates" 
                    checked={skipDuplicates} 
                    onCheckedChange={(checked) => setSkipDuplicates(checked as boolean)} 
                  />
                  <label htmlFor="skipDuplicates" className="text-sm text-foreground">
                    Ignorar transações duplicadas
                  </label>
                </div>

                {/* Account/Card selection: sempre em modo cartão; em outros modos, só se houver conta/cartão ou inferência */}
                {(mode === "credit_card" || !!(inferredMatch?.matchedName || accounts.length > 0 || cards.length > 0)) && (
                  <div className="glass-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {mode === "credit_card" ? "Vincular ao cartão de crédito" : "Vincular a conta/cartão"}
                    </h3>
                    {mode === "credit_card" && (
                      <p className="text-xs text-muted-foreground">
                        Selecione o cartão de crédito ao qual este extrato pertence. Todas as transações serão vinculadas a este cartão.
                      </p>
                    )}
                    {inferredMatch?.confidence === "high" && inferredMatch.matchedName && (
                      <p className="text-xs text-muted-foreground">
                        Detectado pelo arquivo: <span className="font-medium text-foreground">{inferredMatch.matchedName}</span>
                      </p>
                    )}
                    {inferredMatch?.confidence === "low" && inferredMatch.matchedName && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Várias opções possíveis: {inferredMatch.matchedName}. Escolha abaixo se quiser.
                      </p>
                    )}
                    {mode === "credit_card" && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Cartão de Crédito <span className="text-destructive">*</span>
                        </label>
                        {cards.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Carregando cartões...</p>
                        ) : (
                          <Select
                            value={selectedCardId ?? ""}
                            onValueChange={(v) => setSelectedCardId(v || undefined)}
                            required
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecione um cartão" />
                            </SelectTrigger>
                            <SelectContent>
                              {cards.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}{c.last_four ? ` •${c.last_four}` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    {mode !== "credit_card" && accounts.length > 0 && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Conta / Banco</label>
                        <Select
                          value={selectedAccountId ?? "_none_"}
                          onValueChange={(v) => setSelectedAccountId(v === "_none_" ? undefined : v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Família (nenhuma)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none_">Família (nenhuma)</SelectItem>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {mode !== "credit_card" && cards.length > 0 && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cartão (opcional)</label>
                        <Select
                          value={selectedCardId ?? "_none_"}
                          onValueChange={(v) => setSelectedCardId(v === "_none_" ? undefined : v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Nenhum cartão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none_">Nenhum cartão</SelectItem>
                            {cards.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}{c.last_four ? ` •${c.last_four}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {/* Tabs for OK / SKIPPED / ERROR */}
                <Tabs defaultValue="ok" className="w-full">
                  <TabsList className="w-full">
                    <TabsTrigger value="ok" className="flex-1">
                      OK ({validCount})
                    </TabsTrigger>
                    <TabsTrigger value="skipped" className="flex-1">
                      Ignoradas ({skippedCount})
                    </TabsTrigger>
                    <TabsTrigger value="errors" className="flex-1">
                      Erros ({errorCount})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="ok" className="mt-2">
                    <div className="glass-card p-2 max-h-[250px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Tipo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedRows.filter(r => r.status === "OK").slice(0, 30).map((row) => (
                            <TableRow key={row.rowIndex}>
                              <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                              <TableCell className="text-sm">
                                {row.parsed?.transaction_date ? (
                                  <span className="text-foreground">
                                    {new Date(row.parsed.transaction_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm truncate max-w-[100px]">
                                {row.parsed?.description}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium text-destructive">
                                -R$ {Math.abs(row.parsed?.amount || 0).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                                  Gasto
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {parsedRows.filter(r => r.status === "OK").length > 30 && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          Mostrando 30 de {parsedRows.filter(r => r.status === "OK").length} transações
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="skipped" className="mt-2">
                    <div className="glass-card p-2 max-h-[250px] overflow-y-auto">
                      {skippedCount === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma linha ignorada
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40px]">#</TableHead>
                              <TableHead>Conteúdo</TableHead>
                              <TableHead>Motivo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedRows.filter(r => r.status === "SKIPPED").slice(0, 20).map((row) => (
                              <TableRow key={row.rowIndex} className="bg-muted/30">
                                <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                                <TableCell className="text-sm truncate max-w-[150px] text-muted-foreground">
                                  {row.raw.substring(0, 50)}...
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    <MinusCircle className="w-3 h-3 mr-1" />
                                    {row.reason || "Ignorada"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="errors" className="mt-2">
                    <div className="glass-card p-2 max-h-[250px] overflow-y-auto">
                      {errorCount === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum erro encontrado
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40px]">#</TableHead>
                              <TableHead>Conteúdo</TableHead>
                              <TableHead>Erro</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedRows.filter(r => r.status === "ERROR").slice(0, 20).map((row) => (
                              <TableRow key={row.rowIndex} className="bg-destructive/10">
                                <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                                <TableCell className="text-sm truncate max-w-[150px]">
                                  {row.raw.substring(0, 50)}...
                                </TableCell>
                                <TableCell>
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    {row.reason || row.errors[0] || "Erro"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("mapping")} className="flex-1">
                    Voltar
                  </Button>
                  <Button 
                    variant="accent" 
                    onClick={handleImport} 
                    className="flex-1"
                    disabled={validCount === 0}
                  >
                    Importar {validCount} transações
                  </Button>
                </div>
              </>
            )}

            {/* Step 4: Importing */}
            {step === "importing" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-lg font-medium text-foreground">Importando transações...</p>
                <Progress value={importProgress} className="w-full" />
                <p className="text-sm text-muted-foreground">{importProgress}%</p>
              </div>
            )}

            {/* Step 5: Result */}
            {step === "result" && importResult && (
              <>
                <div className="flex flex-col items-center gap-4 py-4" key="result-step">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Importação Concluída</h3>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{importResult.imported}</p>
                    <p className="text-xs text-muted-foreground">Importadas</p>
                  </div>
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-warning">{importResult.duplicates}</p>
                    <p className="text-xs text-muted-foreground">Duplicadas</p>
                  </div>
                  <div className="glass-card p-3 text-center">
                    <p className="text-2xl font-bold text-destructive">{importResult.failed}</p>
                    <p className="text-xs text-muted-foreground">Falharam</p>
                  </div>
                </div>

                {(mode === "credit_card" ? ignoredNegativeCount : ignoredIncomeCount) > 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    {mode === "credit_card"
                      ? `Ignorados (valores negativos): ${ignoredNegativeCount}`
                      : `Ignorados (entradas): ${ignoredIncomeCount}`}
                  </p>
                )}

                {importResult.errors.length > 0 && (
                  <div className="glass-card p-4 bg-destructive/10">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-destructive">Erros na importação</h4>
                      <Button variant="ghost" size="sm" onClick={downloadErrorReport}>
                        <Download className="w-4 h-4 mr-1" />
                        Baixar
                      </Button>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 max-h-[100px] overflow-y-auto">
                      {importResult.errors.slice(0, 5).map((err, idx) => (
                        <li key={idx}>
                          <strong>Linha {err.row}:</strong> {err.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={resetState} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Nova Importação
                  </Button>
                  <Button variant="accent" onClick={handleClose} className="flex-1">
                    Concluído
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="CSV_IMPORT"
      />
    </>
  );
}
