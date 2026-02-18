import { useState, useEffect, useMemo } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useHousehold } from "@/hooks/useHousehold";
import { useHouseholdCategories } from "@/hooks/useHouseholdCategories";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  getTimeline,
  type TimelineResult,
  type TimelineFilters,
} from "@/services/timelineService";
import { TransactionCard } from "@/components/transactions/TransactionCard";
import { EditTransactionSheet } from "@/components/transactions/EditTransactionSheet";
import type { Transaction } from "@/services/transactionService";
import {
  Loader2,
  TrendingDown,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker, getCurrentMonthRange, type DateRange } from "@/components/ui/DateRangePicker";


const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "paid", label: "Pagos" },
  { id: "pending", label: "Pendentes" },
] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function Timeline() {
  const navigate = useNavigate();
  const { currentHousehold, isLoading: householdLoading } = useHousehold();
  const { toast } = useToast();
  const { categories: customCategories } = useHouseholdCategories(currentHousehold?.id);

  const [dateRange, setDateRange] = useState<DateRange>(getCurrentMonthRange);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (currentHousehold?.id) {
      loadTimeline();
    }
  }, [currentHousehold?.id, dateRange.from, dateRange.to, statusFilter]);

  const loadTimeline = async () => {
    if (!currentHousehold?.id) return;
    setIsLoading(true);
    try {
      const filters: TimelineFilters = { from: dateRange.from, to: dateRange.to };
      if (statusFilter !== "all") {
        filters.status = statusFilter as TimelineFilters["status"];
      }
      const data = await getTimeline(currentHousehold.id, filters);
      setResult(data);
    } catch (err) {
      console.error("[timeline] load error:", err);
      toast({ title: "Erro ao carregar timeline", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTxClick = (tx: Transaction) => {
    setEditingTx(tx);
  };

  if (householdLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">Timeline do Mês</h1>
          <p className="text-sm text-muted-foreground">
            Visualize seus gastos dia a dia
          </p>
        </header>

        {/* Date Range Picker */}
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          className="mb-4"
        />

        {/* Summary Cards */}
        {result && !isLoading && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass-card p-3 text-center">
              <TrendingDown className="w-4 h-4 text-destructive mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Gastos</p>
              <p className="text-sm font-bold text-destructive">
                {formatCurrency(result.totalExpense)}
              </p>
            </div>
            <div className="glass-card p-3 text-center">
              <Receipt className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Lançamentos</p>
              <p className="text-sm font-bold text-foreground">
                {result.transactionCount}
              </p>
            </div>
          </div>
        )}

        {/* Status Filter */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all",
                statusFilter === f.id
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {/* Timeline Days */}
        {!isLoading && result && (
          <div className="space-y-6">
            {result.days.length === 0 && (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Nenhum lançamento encontrado para este mês.
                </p>
              </div>
            )}

            {result.days.map((day) => (
              <div key={day.date}>
                {/* Day Header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {day.label}
                  </p>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      day.total >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {formatCurrency(day.total)}
                  </span>
                </div>

                {/* Day Transactions */}
                <div className="space-y-2">
                  {day.items.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={{
                        id: tx.id,
                        description: tx.description,
                        amount: tx.amount,
                        date: tx.transaction_date,
                        category: tx.category,
                        status: tx.status,
                        isRecurring: tx.is_recurring,
                        memberName: tx.member_name,
                      }}
                      onClick={() => handleTxClick(tx)}
                      customCategories={customCategories}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Transaction Sheet */}
      {editingTx && currentHousehold && (
        <EditTransactionSheet
          isOpen={!!editingTx}
          onClose={() => setEditingTx(null)}
          householdId={currentHousehold.id}
          transaction={{
            id: editingTx.id,
            description: editingTx.description,
            amount: editingTx.amount,
            category: editingTx.category,
            status: editingTx.status,
            is_recurring: editingTx.is_recurring,
            transaction_date: editingTx.transaction_date,
            notes: editingTx.notes || "",
            member_id: editingTx.member_id || undefined,
            account_id: editingTx.account_id ?? null,
            credit_card_id: editingTx.credit_card_id ?? null,
          }}
          onUpdate={() => {
            setEditingTx(null);
            loadTimeline();
          }}
        />
      )}
    </MobileLayout>
  );
}
