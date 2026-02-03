import { useState } from "react";
import { Search, Filter, ChevronDown } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { TransactionCard, type Transaction } from "@/components/transactions/TransactionCard";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";

const allTransactions: Transaction[] = [
  {
    id: "1",
    description: "Supermercado Extra",
    amount: -287.45,
    date: "2024-02-03",
    category: "food",
    paymentMethod: "card",
    status: "paid",
  },
  {
    id: "2",
    description: "Conta de Luz - Enel",
    amount: -189.90,
    date: "2024-02-02",
    category: "bills",
    paymentMethod: "pix",
    status: "paid",
    isRecurring: true,
  },
  {
    id: "3",
    description: "Aluguel",
    amount: -1500.00,
    date: "2024-02-01",
    category: "bills",
    paymentMethod: "boleto",
    status: "paid",
    isRecurring: true,
  },
  {
    id: "4",
    description: "Internet Vivo",
    amount: -129.90,
    date: "2024-02-01",
    category: "bills",
    paymentMethod: "pix",
    status: "pending",
    isRecurring: true,
  },
  {
    id: "5",
    description: "Uber",
    amount: -32.50,
    date: "2024-01-31",
    category: "transport",
    paymentMethod: "pix",
    status: "paid",
  },
  {
    id: "6",
    description: "iFood - Pizza",
    amount: -78.90,
    date: "2024-01-30",
    category: "food",
    paymentMethod: "card",
    status: "paid",
  },
  {
    id: "7",
    description: "Netflix",
    amount: -39.90,
    date: "2024-01-30",
    category: "leisure",
    paymentMethod: "card",
    status: "paid",
    isRecurring: true,
  },
  {
    id: "8",
    description: "Spotify",
    amount: -21.90,
    date: "2024-01-30",
    category: "leisure",
    paymentMethod: "card",
    status: "paid",
    isRecurring: true,
  },
  {
    id: "9",
    description: "Farmácia Drogasil",
    amount: -67.80,
    date: "2024-01-29",
    category: "health",
    paymentMethod: "pix",
    status: "paid",
  },
  {
    id: "10",
    description: "Combustível - Shell",
    amount: -180.00,
    date: "2024-01-28",
    category: "transport",
    paymentMethod: "card",
    status: "paid",
  },
  {
    id: "11",
    description: "Cinema",
    amount: -56.00,
    date: "2024-01-27",
    category: "leisure",
    paymentMethod: "pix",
    status: "paid",
  },
  {
    id: "12",
    description: "Curso Udemy",
    amount: -27.90,
    date: "2024-01-26",
    category: "education",
    paymentMethod: "card",
    status: "paid",
  },
];

type FilterCategory = "all" | CategoryType;

export default function Transactions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("all");
  const [showFilters, setShowFilters] = useState(false);

  const filteredTransactions = allTransactions.filter((tx) => {
    const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || tx.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const totalFiltered = filteredTransactions.reduce((acc, tx) => acc + tx.amount, 0);

  // Group by date
  const groupedTransactions = filteredTransactions.reduce((groups, tx) => {
    const date = new Date(tx.date).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(tx);
    return groups;
  }, {} as Record<string, Transaction[]>);

  return (
    <MobileLayout>
      <div className="px-4 pt-safe">
        {/* Header */}
        <header className="py-4">
          <h1 className="text-2xl font-bold text-foreground mb-1">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Total: <span className="text-destructive font-semibold">{formatCurrency(totalFiltered)}</span>
          </p>
        </header>

        {/* Search & Filter */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar gastos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mobile-input pl-12"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-14 px-4 rounded-xl border-2 flex items-center gap-2 transition-all",
              showFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-muted-foreground"
            )}
          >
            <Filter className="w-5 h-5" />
            <ChevronDown className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")} />
          </button>
        </div>

        {/* Category Filters */}
        {showFilters && (
          <div className="mb-4 animate-in-up">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory("all")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                Todos
              </button>
              {(Object.keys(categoryConfig) as CategoryType[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "transition-all",
                    selectedCategory === cat && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-full"
                  )}
                >
                  <CategoryBadge category={cat} size="md" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transaction List */}
        <div className="space-y-6 pb-4">
          {Object.entries(groupedTransactions).map(([date, txs]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                {date}
              </h3>
              <div className="space-y-3">
                {txs.map((tx) => (
                  <TransactionCard key={tx.id} transaction={tx} />
                ))}
              </div>
            </div>
          ))}

          {filteredTransactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum gasto encontrado</p>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
