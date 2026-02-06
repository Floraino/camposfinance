import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import {
  calculateSettlement,
  createSettlements,
  markSettled,
  type SettlementSummary,
} from "@/services/settlementService";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ArrowRight,
  Check,
  Users,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function Settlements() {
  const { currentHousehold, isLoading: householdLoading } = useHousehold();
  const { toast } = useToast();

  const [month, setMonth] = useState(getCurrentMonth);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (currentHousehold?.id) loadSettlement();
  }, [currentHousehold?.id, month]);

  const loadSettlement = async () => {
    if (!currentHousehold?.id) return;
    setIsLoading(true);
    try {
      const data = await calculateSettlement(currentHousehold.id, month);
      setSummary(data);
    } catch (err) {
      console.error("[settlement] load error:", err);
      toast({ title: "Erro ao calcular acertos", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSettlements = async () => {
    if (!currentHousehold?.id || !summary) return;
    setIsCreating(true);
    try {
      const count = await createSettlements(currentHousehold.id, month, summary.debts);
      toast({ title: `${count} acerto(s) criado(s)` });
      await loadSettlement();
    } catch (err) {
      toast({ title: "Erro ao criar acertos", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleMarkSettled = async (settlementId: string) => {
    if (!currentHousehold?.id) return;
    try {
      await markSettled(settlementId, currentHousehold.id);
      toast({ title: "Marcado como acertado" });
      await loadSettlement();
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  if (householdLoading || isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-4 pt-safe pb-24">
        {/* Header */}
        <header className="py-4">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6" />
            Acertos da Casa
          </h1>
          <p className="text-sm text-muted-foreground">Quem deve o quê</p>
        </header>

        {/* Month Selector */}
        <div className="flex items-center justify-between glass-card p-3 mb-4">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">{formatMonth(month)}</span>
          </div>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {summary && (
          <>
            {/* Balances */}
            <h2 className="text-lg font-bold mb-3">Balanço por membro</h2>
            <div className="space-y-2 mb-6">
              {summary.balances.map((b) => (
                <Card key={b.userId} className="border">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{b.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          Pagou: {formatCurrency(b.totalPaid)} • Parte justa: {formatCurrency(b.fairShare)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          b.balance > 0.01
                            ? "text-success"
                            : b.balance < -0.01
                              ? "text-destructive"
                              : "text-muted-foreground"
                        )}
                      >
                        {b.balance > 0.01
                          ? `+${formatCurrency(b.balance)}`
                          : b.balance < -0.01
                            ? formatCurrency(b.balance)
                            : "Em dia"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {summary.balances.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum gasto registrado este mês.
                </p>
              )}
            </div>

            {/* Suggested Debts */}
            {summary.debts.length > 0 && (
              <>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Transferências sugeridas
                </h2>
                <div className="space-y-2 mb-4">
                  {summary.debts.map((d, i) => (
                    <Card key={i} className="border-2 border-amber-500/30 bg-amber-500/5">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">{d.debtorName}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{d.creditorName}</span>
                          <span className="ml-auto text-sm font-bold text-amber-600">
                            {formatCurrency(d.amount)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {summary.settlements.length === 0 && (
                  <Button
                    className="w-full gap-2 mb-6"
                    onClick={handleCreateSettlements}
                    disabled={isCreating}
                  >
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    Criar acertos do mês
                  </Button>
                )}
              </>
            )}

            {/* Existing Settlements */}
            {summary.settlements.length > 0 && (
              <>
                <h2 className="text-lg font-bold mb-3">Acertos registrados</h2>
                <div className="space-y-2">
                  {summary.settlements.map((s) => (
                    <Card key={s.id} className={cn("border", s.status === "settled" && "opacity-60")}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {s.debtor_name} → {s.creditor_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(s.amount)}
                              {s.status === "settled" && " • Acertado"}
                            </p>
                          </div>
                          {s.status === "pending" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => handleMarkSettled(s.id)}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Acertar
                            </Button>
                          ) : (
                            <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full">
                              Acertado
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </MobileLayout>
  );
}
