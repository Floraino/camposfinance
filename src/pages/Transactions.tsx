import { useState, useEffect } from "react";
import { Search, Filter, ChevronDown, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { TransactionCard, type Transaction as UITransaction } from "@/components/transactions/TransactionCard";
import { EditTransactionSheet } from "@/components/transactions/EditTransactionSheet";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";
import { getTransactions, type Transaction } from "@/services/transactionService";
import { useToast } from "@/hooks/use-toast";
import { useHousehold } from "@/hooks/useHousehold";

type FilterCategory = "all" | CategoryType;

export default function Transactions() {
  const navigate = useNavigate();
  const { currentHousehold, hasSelectedHousehold, isLoading: householdLoading } = useHousehold();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const { toast } = useToast();

  // Redirect to household selection if no household selected
  useEffect(() => {
    if (!householdLoading && !hasSelectedHousehold) {
      navigate("/select-household");
    }
  }, [householdLoading, hasSelectedHousehold, navigate]);

  useEffect(() => {
    if (currentHousehold?.id) {
      loadTransactions();
    }
  }, [currentHousehold?.id]);

  const loadTransactions = async () => {
    if (!currentHousehold?.id) return;

    try {
      setIsLoading(true);
      const data = await getTransactions(currentHousehold.id);
      setTransactions(data);
    } catch (error) {
      console.error("Error loading transactions:", error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar os gastos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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

  const filteredTransactions = transactions.filter((tx) => {
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

  const totalFiltered = filteredTransactions.reduce((acc, tx) => acc + Number(tx.amount), 0);

  // Group by date
  const groupedTransactions = filteredTransactions.reduce((groups, tx) => {
    const date = new Date(tx.transaction_date).toLocaleDateString("pt-BR", {
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

  // Map to UI format
  const mapToUI = (tx: Transaction): UITransaction => ({
    id: tx.id,
    description: tx.description,
    amount: Number(tx.amount),
    date: tx.transaction_date,
    category: tx.category,
    paymentMethod: tx.payment_method,
    status: tx.status,
    isRecurring: tx.is_recurring,
  });

  if (householdLoading || isLoading || !currentHousehold) {
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
                  <TransactionCard 
                    key={tx.id} 
                    transaction={mapToUI(tx)} 
                    onClick={() => handleTransactionClick(tx)}
                  />
                ))}
              </div>
            </div>
          ))}

          {filteredTransactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {transactions.length === 0 
                  ? "Nenhum gasto registrado ainda" 
                  : "Nenhum gasto encontrado"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Transaction Sheet */}
      <EditTransactionSheet
        isOpen={showEditSheet}
        transaction={selectedTransaction}
        onClose={handleEditClose}
        onUpdate={loadTransactions}
        householdId={currentHousehold.id}
      />
    </MobileLayout>
  );
}
