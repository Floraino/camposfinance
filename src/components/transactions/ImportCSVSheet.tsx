import { useState, useRef, useCallback } from "react";
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, ChevronRight, Download, RefreshCw, MinusCircle, ArrowUpCircle, ArrowDownCircle, Wand2, FileDown, FileCheck } from "lucide-react";
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
  type CSVAnalysis,
  type ColumnMapping,
  type ParsedRow,
  type ImportResult,
  type ConvertedTransaction,
  type ConversionResult,
} from "@/services/csvImportService";

interface ImportCSVSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type ImportStep = "upload" | "mapping" | "preview" | "importing" | "result" | "convert-preview";
type ImportMode = "standard" | "convert";

const INTERNAL_FIELDS = [
  { value: "description", label: "Descrição" },
  { value: "amount", label: "Valor" },
  { value: "entrada", label: "Entrada (Receita)" },
  { value: "saida", label: "Saída (Despesa)" },
  { value: "date", label: "Data" },
  { value: "category", label: "Categoria" },
  { value: "payment_method", label: "Forma de Pagamento" },
  { value: "notes", label: "Observações" },
  { value: "ignore", label: "Ignorar" },
];

export function ImportCSVSheet({ isOpen, onClose, onImportComplete }: ImportCSVSheetProps) {
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
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleFileSelect = async (file: File, importMode: ImportMode = "standard") => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo CSV (.csv)",
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
      const content = await file.text();
      setCsvContent(content);

      if (importMode === "convert") {
        // Convert bank statement mode
        const result = await convertBankStatement(content);
        setConversionResult(result);
        setStep("convert-preview");
      } else {
        // Standard mode - check if it's already in standard format
        if (isStandardFormat(content)) {
          // Skip AI analysis, parse directly
          const parsed = parseStandardCSV(content);
          setParsedRows(parsed);
          setStep("preview");
          toast({
            title: "Formato padrão detectado",
            description: "Pulando etapa de mapeamento",
          });
        } else {
          // Analyze CSV with AI
          const result = await analyzeCSV(content);
          setAnalysis(result);
          setColumnMappings(result.columnMappings);
          setStep("mapping");
        }
      }
    } catch (error) {
      console.error("Error analyzing CSV:", error);
      toast({
        title: "Erro ao analisar CSV",
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
          amount: c.tipo === "EXPENSE" ? -Math.abs(c.valor) : Math.abs(c.valor),
          type: c.tipo,
          category: c.categoria as any,
          payment_method: c.forma_pagamento as any,
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
      const parsed = parseCSVWithMappings(
        csvContent,
        columnMappings,
        analysis.separator,
        analysis.hasHeader,
        analysis.dateFormat,
        analysis.hasEntradaSaida
      );
      setParsedRows(parsed);
      setStep("preview");
    } catch (error) {
      console.error("Error parsing CSV:", error);
      toast({
        title: "Erro ao processar CSV",
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

    setStep("importing");
    setImportProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const result = await importTransactions(
        currentHousehold.id,
        parsedRows,
        skipDuplicates
      );

      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResult(result);
      setStep("result");

      if (result.imported > 0) {
        toast({
          title: "Importação concluída!",
          description: `${result.imported} transações importadas com sucesso.`,
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
  const incomeCount = parsedRows.filter(r => r.parsed?.type === "INCOME").length;
  const expenseCount = parsedRows.filter(r => r.parsed?.type === "EXPENSE").length;

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
              <h2 className="text-xl font-bold text-foreground">Importar CSV</h2>
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
                2. {mode === "convert" ? "Conversão" : "Mapeamento"}
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
                      <Button variant="outline" size="sm" onClick={() => downloadCSVTemplate()}>
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Modelo CSV
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Two import options */}
                <div className="grid gap-3">
                  {/* Standard Import */}
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
                          <p className="font-medium text-foreground">Analisando CSV...</p>
                          <p className="text-sm text-muted-foreground">Detectando formato automaticamente</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <FileSpreadsheet className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Importar CSV</p>
                          <p className="text-sm text-muted-foreground">
                            Formato padrão ou extrato de banco
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
                  accept=".csv"
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

                {/* Income/Expense Summary */}
                <div className="flex items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2 text-success">
                    <ArrowUpCircle className="w-5 h-5" />
                    <span className="font-medium">
                      R$ {conversionResult.summary.totalIncome.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">receitas</span>
                  </div>
                  <div className="flex items-center gap-2 text-destructive">
                    <ArrowDownCircle className="w-5 h-5" />
                    <span className="font-medium">
                      R$ {conversionResult.summary.totalExpense.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">despesas</span>
                  </div>
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
                              <TableCell className={`text-right text-sm font-medium ${tx.tipo === "INCOME" ? "text-success" : "text-destructive"}`}>
                                {tx.tipo === "INCOME" ? "+" : "-"}R$ {tx.valor.toFixed(2)}
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

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
                    Voltar
                  </Button>
                  <Button 
                    variant="accent" 
                    onClick={handleContinueToPreview} 
                    className="flex-1"
                    disabled={isLoading || !columnMappings.some(m => m.internalField === "amount")}
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

                {/* Income/Expense breakdown */}
                {validCount > 0 && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-success">
                      <ArrowUpCircle className="w-4 h-4" />
                      <span>{incomeCount} receitas</span>
                    </div>
                    <div className="flex items-center gap-1 text-destructive">
                      <ArrowDownCircle className="w-4 h-4" />
                      <span>{expenseCount} despesas</span>
                    </div>
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
                              <TableCell className={`text-right text-sm font-medium ${row.parsed?.type === "INCOME" ? "text-success" : "text-destructive"}`}>
                                {row.parsed?.type === "INCOME" ? "+" : "-"}R$ {Math.abs(row.parsed?.amount || 0).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                {row.parsed?.type === "INCOME" ? (
                                  <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                                    Receita
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                                    Despesa
                                  </Badge>
                                )}
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
                <div className="flex flex-col items-center gap-4 py-4">
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
