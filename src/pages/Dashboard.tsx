import { useState, useEffect } from "react";
import { Bell, ChevronRight, Sparkles, TrendingDown, Wallet, Loader2, ScanLine, Plus, Settings } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { StatCard } from "@/components/ui/StatCard";
import { TransactionCard, type Transaction as UITransaction } from "@/components/transactions/TransactionCard";
import { ExpensePieChart, MonthlyBarChart } from "@/components/charts/ExpenseCharts";
import { AddTransactionSheet } from "@/components/transactions/AddTransactionSheet";
import { ReceiptScanner } from "@/components/receipts/ReceiptScanner";
import { BudgetSheet } from "@/components/settings/BudgetSheet";
import { type CategoryType } from "@/components/ui/CategoryBadge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getTransactions, addTransaction, getMonthlyStats, getMonthlyEvolution, type Transaction, type NewTransaction, type MonthlyExpense } from "@/services/transactionService";
import { getCurrentBudget, type Budget } from "@/services/budgetService";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBudgetSheet, setShowBudgetSheet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyExpense[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [stats, setStats] = useState({
    totalExpenses: 0,
    totalIncome: 0,
    balance: 0,
    byCategory: {} as Record<CategoryType, number>,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [txs, monthStats, evolution, currentBudget] = await Promise.all([
        getTransactions(),
        getMonthlyStats(),
        getMonthlyEvolution(5),
        getCurrentBudget("monthly"),
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

  const handleAddTransaction = async (newTx: NewTransaction) => {
    try {
      const tx = await addTransaction(newTx);
      setTransactions((prev) => [tx, ...prev]);
      
      // Refresh stats and monthly data
      const [monthStats, evolution] = await Promise.all([
        getMonthlyStats(),
        getMonthlyEvolution(5),
      ]);
      setStats(monthStats);
      setMonthlyData(evolution);
      
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const currentDate = new Date();
  const monthName = currentDate.toLocaleDateString("pt-BR", { month: "long" });

  // Prepare pie chart data
  const pieChartData = Object.entries(stats.byCategory)
    .map(([category, amount]) => ({
      category: category as CategoryType,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Map Transaction to UITransaction
  const uiTransactions: UITransaction[] = transactions.map(tx => ({
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

  if (authLoading || isLoading) {
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
              {profile?.display_name || "Casa"}
              <span className="text-accent">Campos</span>
            </h1>
          </div>
          <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {transactions.some(t => t.status === "pending") && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full" />
            )}
          </button>
        </header>

        {/* AI Insight Card */}
        <button 
          onClick={() => navigate("/assistant")}
          className="w-full glass-card p-4 mb-6 flex items-center gap-4 touch-feedback"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-accent" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-foreground">Dica do Odin</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {transactions.length === 0 
                ? "Adicione seu primeiro gasto para começar a acompanhar suas finanças!"
                : "Você gastou 15% mais com delivery este mês. Que tal cozinhar mais em casa?"}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </button>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setShowScanner(true)}
            className="flex-1 glass-card p-4 flex items-center gap-3 touch-feedback"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <ScanLine className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Escanear Cupom</p>
              <p className="text-xs text-muted-foreground">Leitura com IA</p>
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
            subtitle={`em ${monthName}`}
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
          onClick={() => setShowBudgetSheet(true)}
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
        </button>

        {/* Expense Distribution */}
        {pieChartData.length > 0 && (
          <div className="glass-card p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Gastos por Categoria</h2>
              <span className="text-xs text-muted-foreground capitalize">{monthName}</span>
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
            <h2 className="font-semibold text-foreground">Últimos Lançamentos</h2>
            <button 
              onClick={() => navigate("/transactions")}
              className="text-sm text-primary font-medium"
            >
              Ver todos
            </button>
          </div>
          
          {uiTransactions.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-muted-foreground mb-4">Nenhum gasto registrado ainda</p>
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
                <TransactionCard key={tx.id} transaction={tx} />
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
      />

      {/* Receipt Scanner */}
      <ReceiptScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onTransactionAdded={loadData}
      />

      {/* Budget Sheet */}
      <BudgetSheet
        isOpen={showBudgetSheet}
        onClose={() => setShowBudgetSheet(false)}
        onBudgetUpdated={loadData}
      />
    </MobileLayout>
  );
}
