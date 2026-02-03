import { useState } from "react";
import { Bell, ChevronRight, Sparkles, TrendingDown, Wallet } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { StatCard } from "@/components/ui/StatCard";
import { TransactionCard, type Transaction } from "@/components/transactions/TransactionCard";
import { ExpensePieChart, MonthlyBarChart } from "@/components/charts/ExpenseCharts";
import { AddTransactionSheet, type NewTransaction } from "@/components/transactions/AddTransactionSheet";
import { type CategoryType } from "@/components/ui/CategoryBadge";
import { useNavigate } from "react-router-dom";

// Dados de exemplo
const mockTransactions: Transaction[] = [
  {
    id: "1",
    description: "Supermercado Extra",
    amount: -287.45,
    date: "2024-02-01",
    category: "food",
    paymentMethod: "card",
    status: "paid",
  },
  {
    id: "2",
    description: "Conta de Luz - Enel",
    amount: -189.90,
    date: "2024-02-01",
    category: "bills",
    paymentMethod: "pix",
    status: "paid",
    isRecurring: true,
  },
  {
    id: "3",
    description: "Uber",
    amount: -32.50,
    date: "2024-01-31",
    category: "transport",
    paymentMethod: "pix",
    status: "paid",
  },
  {
    id: "4",
    description: "Netflix",
    amount: -39.90,
    date: "2024-01-30",
    category: "leisure",
    paymentMethod: "card",
    status: "paid",
    isRecurring: true,
  },
  {
    id: "5",
    description: "Farmácia Drogasil",
    amount: -67.80,
    date: "2024-01-29",
    category: "health",
    paymentMethod: "pix",
    status: "paid",
  },
];

const pieChartData = [
  { category: "bills" as CategoryType, amount: 1850 },
  { category: "food" as CategoryType, amount: 980 },
  { category: "transport" as CategoryType, amount: 450 },
  { category: "leisure" as CategoryType, amount: 320 },
  { category: "shopping" as CategoryType, amount: 280 },
  { category: "health" as CategoryType, amount: 180 },
];

const monthlyData = [
  { month: "Set", income: 6500, expenses: 4200 },
  { month: "Out", income: 6500, expenses: 4800 },
  { month: "Nov", income: 7200, expenses: 5100 },
  { month: "Dez", income: 8500, expenses: 6200 },
  { month: "Jan", income: 6500, expenses: 4060 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const handleAddTransaction = (newTx: NewTransaction) => {
    const transaction: Transaction = {
      id: Date.now().toString(),
      ...newTx,
      date: new Date().toISOString().split("T")[0],
    };
    setTransactions((prev) => [transaction, ...prev]);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const currentDate = new Date();
  const monthName = currentDate.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <MobileLayout>
      <div className="px-4 pt-safe">
        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm text-muted-foreground">Olá, boa tarde! 👋</p>
            <h1 className="text-2xl font-bold text-foreground">
              Casa<span className="text-accent">Clara</span>
            </h1>
          </div>
          <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full" />
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
            <p className="text-sm font-medium text-foreground">Dica da Clara</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              Você gastou 15% mais com delivery este mês. Que tal cozinhar mais em casa?
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </button>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard
            title="Gastos do Mês"
            value={formatCurrency(4060)}
            trend={12}
            variant="expense"
            icon={TrendingDown}
            subtitle={`em ${monthName}`}
          />
          <StatCard
            title="Saldo Livre"
            value={formatCurrency(2440)}
            trend={-5}
            variant="balance"
            icon={Wallet}
            subtitle="para gastar"
          />
        </div>

        {/* Expense Distribution */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Gastos por Categoria</h2>
            <span className="text-xs text-muted-foreground capitalize">{monthName}</span>
          </div>
          <ExpensePieChart data={pieChartData} />
        </div>

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
          <div className="space-y-3">
            {transactions.slice(0, 4).map((tx) => (
              <TransactionCard key={tx.id} transaction={tx} />
            ))}
          </div>
        </div>
      </div>

      {/* Add Transaction Sheet */}
      <AddTransactionSheet
        isOpen={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdd={handleAddTransaction}
      />
    </MobileLayout>
  );
}
