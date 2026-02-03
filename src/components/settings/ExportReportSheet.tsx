import { useState } from "react";
import { X, FileText, FileSpreadsheet, Download, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ExportReportSheetProps {
  open: boolean;
  onClose: () => void;
}

type ExportFormat = "csv" | "json";
type DateRange = "1month" | "3months" | "6months" | "12months" | "all";

export function ExportReportSheet({ open, onClose }: ExportReportSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [selectedRange, setSelectedRange] = useState<DateRange>("3months");

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "1month", label: "Último mês" },
    { value: "3months", label: "Últimos 3 meses" },
    { value: "6months", label: "Últimos 6 meses" },
    { value: "12months", label: "Último ano" },
    { value: "all", label: "Todos os dados" },
  ];

  const getDateRange = (range: DateRange): { start: Date | null; end: Date } => {
    const now = new Date();
    const end = endOfMonth(now);

    switch (range) {
      case "1month":
        return { start: startOfMonth(now), end };
      case "3months":
        return { start: startOfMonth(subMonths(now, 2)), end };
      case "6months":
        return { start: startOfMonth(subMonths(now, 5)), end };
      case "12months":
        return { start: startOfMonth(subMonths(now, 11)), end };
      case "all":
        return { start: null, end };
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);

    try {
      const { start, end } = getDateRange(selectedRange);
      
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("transaction_date", { ascending: false });

      if (start) {
        query = query.gte("transaction_date", format(start, "yyyy-MM-dd"));
      }
      query = query.lte("transaction_date", format(end, "yyyy-MM-dd"));

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "Nenhum dado encontrado",
          description: "Não há transações no período selecionado.",
        });
        return;
      }

      let content: string;
      let filename: string;
      let mimeType: string;

      if (selectedFormat === "csv") {
        // Create CSV
        const headers = ["Data", "Descrição", "Categoria", "Valor", "Método", "Status", "Recorrente", "Notas"];
        const rows = data.map(t => [
          format(new Date(t.transaction_date), "dd/MM/yyyy"),
          `"${t.description}"`,
          t.category,
          t.amount.toString().replace(".", ","),
          t.payment_method,
          t.status,
          t.is_recurring ? "Sim" : "Não",
          t.notes ? `"${t.notes}"` : "",
        ]);
        
        content = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
        filename = `casaclara_relatorio_${format(new Date(), "yyyy-MM-dd")}.csv`;
        mimeType = "text/csv;charset=utf-8;";
      } else {
        // Create JSON
        content = JSON.stringify(data, null, 2);
        filename = `casaclara_relatorio_${format(new Date(), "yyyy-MM-dd")}.json`;
        mimeType = "application/json";
      }

      // Download file
      const blob = new Blob(["\ufeff" + content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Relatório exportado!",
        description: `${data.length} transações foram exportadas.`,
      });

      onClose();
    } catch (error) {
      console.error("Error exporting:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o relatório",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[80vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Exportar Relatório</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-6 pb-safe">
          {/* Date Range */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Período
            </label>
            <div className="grid grid-cols-2 gap-2">
              {dateRangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedRange(option.value)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                    selectedRange === option.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-border hover:border-primary/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-3 block">
              Formato do arquivo
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedFormat("csv")}
                className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  selectedFormat === "csv"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 border-border hover:border-primary/50"
                }`}
              >
                <FileSpreadsheet className="w-8 h-8" />
                <span className="font-medium">CSV / Excel</span>
                <span className={`text-xs ${selectedFormat === "csv" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  Para planilhas
                </span>
              </button>
              <button
                onClick={() => setSelectedFormat("json")}
                className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                  selectedFormat === "json"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 border-border hover:border-primary/50"
                }`}
              >
                <FileText className="w-8 h-8" />
                <span className="font-medium">JSON</span>
                <span className={`text-xs ${selectedFormat === "json" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  Para desenvolvedores
                </span>
              </button>
            </div>
          </div>

          {/* Export Button */}
          <Button 
            variant="accent" 
            size="lg" 
            className="w-full"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Exportar Relatório
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
