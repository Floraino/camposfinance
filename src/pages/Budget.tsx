import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import { getCurrentBudget, type Budget as BudgetType } from "@/services/budgetService";
import { getCategoryBudgets, type CategoryBudget } from "@/services/categoryBudgetService";
import { getTransactions, type Transaction } from "@/services/transactionService";
import { categoryConfig } from "@/components/ui/CategoryBadge";
import {
  Loader2,
  TrendingDown,
  TrendingUp,
  Target,
  PiggyBank,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function BudgetPage() {
  const { currentHousehold, isLoading: householdLoading } = useHousehold();
  const { toast } = useToast();

  const [budget, setBudget] = useState<BudgetType | null>(null);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentHousehold?.id) loadData();
  }, [currentHousehold?.id]);

  const loadData = async () => {
    if (!currentHousehold?.id) return;
    setIsLoading(true);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const [b, cb, txs] = await Promise.all([
        getCurrentBudget(currentHousehold.id).catch(() => null),
        getCategoryBudgets(currentHousehold.id, month, year).catch(() => []),
        getTransactions(currentHousehold.id),
      ]);
      setBudget(b);
      setCategoryBudgets(cb);
      setTransactions(txs);
    } catch (err) {
      console.error("[budget] load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Current month transactions
  const now = new Date();
  const currentMonthTxs = transactions.filter((tx) => {
    const d = new Date(tx.transaction_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalExpense = currentMonthTxs
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const budgetAmount = budget?.amount || 0;
  const budgetPct = budgetAmount > 0 ? Math.round((totalExpense / budgetAmount) * 100) : 0;
  const remaining = budgetAmount - totalExpense;

  // Days left in month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const projectedTotal = daysLeft > 0 ? totalExpense + (totalExpense / now.getDate()) * daysLeft : totalExpense;
  const projectedFree = budgetAmount - projectedTotal;

  // Spending by category
  const spentByCategory: Record<string, number> = {};
  for (const tx of currentMonthTxs.filter((t) => t.amount < 0)) {
    spentByCategory[tx.category] = (spentByCategory[tx.category] || 0) + Math.abs(tx.amount);
  }

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
        <header className="py-4">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PiggyBank className="w-6 h-6" />
            Orçamento do Mês
          </h1>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </p>
        </header>

        {/* Overall Budget */}
        {budgetAmount > 0 ? (
          <Card className="mb-4 border-2">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Orçamento total</span>
                <span className="text-sm font-bold text-foreground">{formatCurrency(budgetAmount)}</span>
              </div>
              <div className="w-full h-4 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    budgetPct >= 100
                      ? "bg-destructive"
                      : budgetPct >= 80
                        ? "bg-amber-500"
                        : "bg-primary"
                  )}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Gasto: {formatCurrency(totalExpense)} ({budgetPct}%)</span>
                <span className={cn(
                  "font-bold",
                  remaining >= 0 ? "text-success" : "text-destructive"
                )}>
                  {remaining >= 0 ? `Sobra: ${formatCurrency(remaining)}` : `Estourou: ${formatCurrency(Math.abs(remaining))}`}
                </span>
              </div>

              {/* Projection */}
              {daysLeft > 0 && budgetAmount > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">
                    Projeção até fim do mês ({daysLeft} dias restantes)
                  </p>
                  <p className={cn(
                    "text-sm font-bold",
                    projectedFree >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {projectedFree >= 0
                      ? `Saldo livre projetado: ${formatCurrency(projectedFree)}`
                      : `Projeção de estouro: ${formatCurrency(Math.abs(projectedFree))}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4 border-2 border-dashed border-muted-foreground/30">
            <CardContent className="py-6 text-center">
              <Target className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum orçamento definido. Configure em Ajustes.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-3 mb-6">
          <Card className="border">
            <CardContent className="pt-3 pb-3 text-center">
              <TrendingDown className="w-4 h-4 text-destructive mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Gastos do mês</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totalExpense)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Category Budgets */}
        {categoryBudgets.length > 0 && (
          <>
            <h2 className="text-lg font-bold text-foreground mb-3">Metas por Categoria</h2>
            <div className="space-y-3">
              {categoryBudgets.map((cb) => {
                const spent = spentByCategory[cb.category] || 0;
                const pct = Math.round((spent / cb.amount) * 100);
                const config = categoryConfig[cb.category as keyof typeof categoryConfig];
                const label = config?.label || cb.category;

                return (
                  <Card key={cb.id} className="border">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(spent)} / {formatCurrency(cb.amount)}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            pct >= 100
                              ? "bg-destructive"
                              : pct >= (cb.alert_threshold || 80)
                                ? "bg-amber-500"
                                : "bg-primary"
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{pct}% utilizado</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {categoryBudgets.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Sem metas por categoria. Configure em Ajustes → Metas por Categoria.
            </p>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
