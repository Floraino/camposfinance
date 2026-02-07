import { useState, useEffect } from "react";
import { Bell, ChevronRight, TrendingDown, Wallet, Loader2, ScanLine, Plus, Settings, Crown } from "lucide-react";
import odinLogo from "@/assets/odin-logo.png";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { StatCard } from "@/components/ui/StatCard";
import { TransactionCard, type Transaction as UITransaction } from "@/components/transactions/TransactionCard";
import { EditTransactionSheet } from "@/components/transactions/EditTransactionSheet";
import { ExpensePieChart, MonthlyBarChart } from "@/components/charts/ExpenseCharts";
import { AddTransactionSheet } from "@/components/transactions/AddTransactionSheet";
import { ReceiptScanner } from "@/components/receipts/ReceiptScanner";
import { BudgetSheet } from "@/components/settings/BudgetSheet";
import { type CategoryType } from "@/components/ui/CategoryBadge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { useProFeature } from "@/hooks/useProFeature";
import { getTransactions, addTransaction, getMonthlyStats, getMonthlyEvolution, type Transaction, type NewTransaction, type MonthlyExpense } from "@/services/transactionService";
import { getCurrentBudget, type Budget } from "@/services/budgetService";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { ProBadge } from "@/components/paywall/ProBadge";
import { PendingWidget } from "@/components/pending/PendingWidget";
import { DateRangePicker, getCurrentMonthRange, type DateRange } from "@/components/ui/DateRangePicker";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, isLoading: authLoading } = useAuth();
  const { currentHousehold, hasSelectedHousehold, isLoading: householdLoading, planType } = useHousehold();
  const { toast } = useToast();
  
  // Use centralized PRO feature check for OCR
  const ocrFeature = useProFeature("OCR_SCAN");
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBudgetSheet, setShowBudgetSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyExpense[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [odinInsight, setOdinInsight] = useState<string>("");
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  
  // Date range state (replaces month/year)
  const [dateRange, setDateRange] = useState<DateRange>(getCurrentMonthRange);
  
  const [stats, setStats] = useState({
    totalExpenses: 0,
    byCategory: {} as Record<CategoryType, number>,
  });

  // Redirect to household selection if no household selected
  useEffect(() => {
    if (!householdLoading && !hasSelectedHousehold) {
      navigate("/select-household");
    }
  }, [householdLoading, hasSelectedHousehold, navigate]);

  useEffect(() => {
    if (currentHousehold?.id) {
      loadData();
    }
  }, [dateRange.from, dateRange.to, currentHousehold?.id]);

  const loadData = async () => {
    if (!currentHousehold?.id) return;

    try {
      setIsLoading(true);
      const [txs, monthStats, evolution, currentBudget] = await Promise.all([
        getTransactions(currentHousehold.id),
        getMonthlyStats(currentHousehold.id, dateRange.from, dateRange.to),
        getMonthlyEvolution(currentHousehold.id, 5),
        getCurrentBudget(currentHousehold.id, "monthly"),
      ]);
      setTransactions(txs);
      setStats(monthStats);
      setMonthlyData(evolution);
      setBudget(currentBudget);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOdinInsight = async (txs: Transaction[]) => {
    if (txs.length === 0) {
      setOdinInsight("Adicione seu primeiro gasto para que eu possa analisar suas finanças! 📊");
      return;
    }

    setIsLoadingInsight(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!baseUrl || baseUrl === "undefined") {
        setOdinInsight("Configure VITE_SUPABASE_URL no .env para ver dicas do Odin.");
        return;
      }
      if (!anonKey || anonKey === "undefined") {
        setOdinInsight("Configure VITE_SUPABASE_PUBLISHABLE_KEY no .env.");
        return;
      }

      const response = await fetch(`${baseUrl}/functions/v1/clara-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          messages: [{ 
            role: "user", 
            content: "Me dê uma dica rápida e objetiva (máximo 2 frases curtas) sobre meus gastos deste mês. Seja direto e útil." 
          }],
          householdId: currentHousehold?.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 503 && err.code === "AI_NOT_CONFIGURED") {
          setOdinInsight("Configure GEMINI_API_KEY nas Edge Functions do Supabase para dicas do Odin.");
          return;
        }
        throw new Error(err.error || "Failed to fetch insight");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let insightText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const json = JSON.parse(line.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) insightText += content;
            } catch { /* ignore parse errors */ }
          }
        }
      }

      setOdinInsight(insightText || "Analisando seus padrões de gastos... 🔍");
    } catch (error) {
      console.error("Error fetching insight:", error);
      const msg = error instanceof Error ? error.message : "";
      const isNetworkError = msg === "Failed to fetch" || msg.includes("NetworkError");
      setOdinInsight(isNetworkError
        ? "Não foi possível conectar ao Odin. Verifique a conexão e a Edge Function clara-chat."
        : "Toque para ver análise completa das suas finanças 💡");
    } finally {
      setIsLoadingInsight(false);
    }
  };

  useEffect(() => {
    if (transactions.length > 0 && !isLoading && currentHousehold?.id) {
      fetchOdinInsight(transactions);
    }
  }, [transactions.length, isLoading, currentHousehold?.id]);

  const handleAddTransaction = async (newTx: NewTransaction) => {
    if (!currentHousehold?.id) return;

    try {
      const tx = await addTransaction(currentHousehold.id, newTx);
      setTransactions((prev) => [tx, ...prev]);
      
      // Refresh stats and monthly data
      const [monthStats, evolution] = await Promise.all([
        getMonthlyStats(currentHousehold.id, dateRange.from, dateRange.to),
        getMonthlyEvolution(currentHousehold.id, 5),
      ]);
      setStats(monthStats);
      setMonthlyData(evolution);
      
      queryClient.invalidateQueries({ queryKey: ["accounts", currentHousehold.id] });
      toast({
        title: "Gasto adicionado!",
        description: `${newTx.description} foi registrado com sucesso.`,
      });
    } catch (error) {
      console.error("Error adding transaction:", error);
      toast({
        title: "Erro ao adicionar",
        description: "Não foi possível salvar o gasto",
        variant: "destructive",
      });
    }
  };

  const handleTransactionClick = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setShowEditSheet(true);
  };

  const handleEditClose = () => {
    setShowEditSheet(false);
    setSelectedTransaction(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Derive a friendly period label for display
  const periodLabel = (() => {
    const from = new Date(dateRange.from + "T12:00:00");
    const to = new Date(dateRange.to + "T12:00:00");
    if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
      const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                     "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      return names[from.getMonth()];
    }
    return `${from.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${to.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  })();

  // Filter transactions for selected date range
  const filteredTransactions = transactions.filter(tx => {
    return tx.transaction_date >= dateRange.from && tx.transaction_date <= dateRange.to;
  });

  // Prepare pie chart data
  const pieChartData = Object.entries(stats.byCategory)
    .map(([category, amount]) => ({
      category: category as CategoryType,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Map Transaction to UITransaction
  const uiTransactions: UITransaction[] = filteredTransactions.map(tx => ({
    id: tx.id,
    description: tx.description,
    amount: Number(tx.amount),
    date: tx.transaction_date,
    category: tx.category,
    paymentMethod: tx.payment_method,
    status: tx.status,
    isRecurring: tx.is_recurring,
    memberName: tx.member_name,
  }));

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  if (authLoading || householdLoading || isLoading || !currentHousehold) {
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
      <div className="px-4 pt-safe">
        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm text-muted-foreground">{greeting()}! 👋</p>
            <h1 className="text-2xl font-bold text-foreground">
              {currentHousehold.name}
            </h1>
          </div>
          <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {transactions.some(t => t.status === "pending") && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full" />
            )}
          </button>
        </header>

        {/* Date Range Picker */}
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          className="mb-6"
        />

        {/* AI Insight Card */}
        <button 
          onClick={() => navigate("/assistant")}
          className="w-full glass-card p-4 mb-6 flex items-center gap-4 touch-feedback"
        >
          <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0">
            <img src={odinLogo} alt="Odin" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-foreground">Dica do Odin</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {isLoadingInsight ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analisando seus gastos...
                </span>
              ) : (
                odinInsight || "Toque para conversar sobre suas finanças"
              )}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </button>

        {/* Pending Items Widget */}
        <PendingWidget householdId={currentHousehold.id} className="mb-6" />

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setShowScanner(true)}
            className="flex-1 glass-card p-4 flex items-center gap-3 touch-feedback relative"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center relative">
              <ScanLine className="w-5 h-5 text-primary" />
              <ProBadge show={!ocrFeature.allowed} size="sm" iconOnly className="absolute -top-1 -right-1" />
            </div>
            <div className="text-left flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground">Escanear Cupom</p>
                {!ocrFeature.allowed && (
                  <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">PRO</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {ocrFeature.allowed ? "Leitura com IA" : "Recurso PRO"}
              </p>
            </div>
          </button>
          <button
            onClick={() => setShowAddSheet(true)}
            className="flex-1 glass-card p-4 flex items-center gap-3 touch-feedback"
          >
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
              <Plus className="w-5 h-5 text-accent" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Novo Gasto</p>
              <p className="text-xs text-muted-foreground">Manual</p>
            </div>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard
            title="Gastos do Mês"
            value={formatCurrency(stats.totalExpenses)}
            variant="expense"
            icon={TrendingDown}
            subtitle={`em ${periodLabel}`}
          />
          <StatCard
            title="Saldo Livre"
            value={formatCurrency(budget ? budget.amount - stats.totalExpenses : 0)}
            variant="balance"
            icon={Wallet}
            subtitle={budget ? "para gastar" : "defina orçamento"}
          />
        </div>

        {/* Budget Progress */}
        <button 
          onClick={() => navigate("/budget")}
          className="w-full glass-card p-4 mb-6 touch-feedback"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Orçamento do Mês</h3>
            </div>
            <Settings className="w-4 h-4 text-muted-foreground" />
          </div>
          {budget ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {formatCurrency(stats.totalExpenses)} de {formatCurrency(budget.amount)}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {Math.min(Math.round((stats.totalExpenses / budget.amount) * 100), 100)}%
                </span>
              </div>
              <Progress 
                value={Math.min((stats.totalExpenses / budget.amount) * 100, 100)} 
                className="h-2"
              />
              {stats.totalExpenses > budget.amount && (
                <p className="text-xs text-destructive mt-2">
                  Você ultrapassou o orçamento em {formatCurrency(stats.totalExpenses - budget.amount)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Toque para definir seu orçamento mensal
            </p>
          )}
          <p className="text-xs text-primary mt-2 underline">Ver painel completo →</p>
        </button>

        {/* Budget panel link - navigates to /budget on click */}
        {/* The button above already opens BudgetSheet; add a separate link */}

        {/* Expense Distribution */}
        {pieChartData.length > 0 && (
          <div className="glass-card p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Gastos por Categoria</h2>
              <span className="text-xs text-muted-foreground capitalize">{periodLabel}</span>
            </div>
            <ExpensePieChart data={pieChartData} />
          </div>
        )}

        {/* Monthly Comparison */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Evolução Mensal</h2>
            <span className="text-xs text-muted-foreground">Últimos 5 meses</span>
          </div>
          <MonthlyBarChart data={monthlyData} />
        </div>

        {/* Recent Transactions */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">
              {`Lançamentos — ${periodLabel}`}
            </h2>
            <button 
              onClick={() => navigate("/transactions")}
              className="text-sm text-primary font-medium"
            >
              Ver todos
            </button>
          </div>
          
          {uiTransactions.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-muted-foreground mb-4">
                Nenhum gasto neste período
              </p>
              <button 
                onClick={() => setShowAddSheet(true)}
                className="text-primary font-medium"
              >
                Adicionar primeiro gasto
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {uiTransactions.slice(0, 4).map((tx) => (
                <TransactionCard 
                  key={tx.id} 
                  transaction={tx} 
                  onClick={() => handleTransactionClick(
                    transactions.find(t => t.id === tx.id)!
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Transaction Sheet */}
      <AddTransactionSheet
        isOpen={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdd={handleAddTransaction}
        householdId={currentHousehold.id}
      />

      {/* Receipt Scanner */}
      <ReceiptScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onTransactionAdded={loadData}
        onContinueManually={() => {
          setShowScanner(false);
          setShowAddSheet(true);
        }}
        householdId={currentHousehold.id}
      />

      {/* Budget Sheet */}
      <BudgetSheet
        isOpen={showBudgetSheet}
        onClose={() => setShowBudgetSheet(false)}
        onBudgetUpdated={loadData}
        householdId={currentHousehold.id}
      />

      {/* Edit Transaction Sheet */}
      <EditTransactionSheet
        isOpen={showEditSheet}
        transaction={selectedTransaction}
        onClose={handleEditClose}
        onUpdate={loadData}
        householdId={currentHousehold.id}
      />
    </MobileLayout>
  );
}
