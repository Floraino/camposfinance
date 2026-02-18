import { useState, useEffect } from "react";
import { Search, Filter, ChevronDown, Loader2, Trash2, X, CheckSquare, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { TransactionCard, type Transaction as UITransaction } from "@/components/transactions/TransactionCard";
import { EditTransactionSheet } from "@/components/transactions/EditTransactionSheet";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { getCategoryOptionsForPicker } from "@/lib/categoryResolvers";
import { cn } from "@/lib/utils";
import { getTransactions, deleteTransactionsBulk, type Transaction } from "@/services/transactionService";
import { useToast } from "@/hooks/use-toast";
import { useHousehold } from "@/hooks/useHousehold";
import { useHouseholdCategories } from "@/hooks/useHouseholdCategories";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

type FilterCategory = "all" | string;

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
  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const { toast } = useToast();
  const { categories: customCategories } = useHouseholdCategories(currentHousehold?.id);

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

  // Bulk selection helpers
  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredTransactions.map((tx) => tx.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const handleBulkDelete = async () => {
    if (!currentHousehold?.id || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const count = await deleteTransactionsBulk(Array.from(selectedIds), currentHousehold.id);
      toast({
        title: `${count} gasto${count > 1 ? "s" : ""} excluído${count > 1 ? "s" : ""}`,
      });
      setTransactions((prev) => prev.filter((tx) => !selectedIds.has(tx.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error("Bulk delete error:", error);
      toast({ title: "Erro ao excluir", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || tx.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const visibleIds = filteredTransactions.map((tx) => tx.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">Gastos</h1>
              <p className="text-sm text-muted-foreground">
                Total: <span className="text-destructive font-semibold">{formatCurrency(totalFiltered)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/timeline")}
              className="gap-1.5"
            >
              <CalendarDays className="w-4 h-4" />
              Timeline
            </Button>
            <Button
              variant={selectMode ? "default" : "outline"}
              size="sm"
              onClick={toggleSelectMode}
              className="gap-1.5"
            >
              {selectMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              {selectMode ? "Cancelar" : "Selecionar"}
            </Button>
            </div>
          </div>
        </header>

        {/* Selection toolbar (tema dark, rounded, ghost) */}
        {selectMode && (
          <div
            className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors animate-in-up"
            role="toolbar"
            aria-label="Seleção de gastos"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Checkbox
                id="select-all-gastos"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => toggleSelectAll()}
                className="h-5 w-5 rounded-md border-white/[0.08] bg-white/[0.03] data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary focus-visible:ring-primary shrink-0"
                aria-label={allSelected ? "Desmarcar todos" : "Selecionar todos"}
              />
              <button
                onClick={toggleSelectAll}
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {allSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              Selecionados: {selectedIds.size}
            </span>
            {selectedIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="text-muted-foreground hover:text-foreground hover:bg-white/[0.06] rounded-xl"
              >
                Limpar
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="gap-1.5 rounded-xl ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Excluir ({selectedIds.size})
            </Button>
          </div>
        )}

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
              {getCategoryOptionsForPicker(customCategories).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedCategory(opt.value)}
                  className={cn(
                    "transition-all",
                    selectedCategory === opt.value && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-full"
                  )}
                >
                  <CategoryBadge category={opt.value} size="md" customCategories={customCategories} />
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
                  <div key={tx.id} className="flex items-center gap-2">
                    {selectMode && (
                      <Checkbox
                        id={`select-${tx.id}`}
                        checked={selectedIds.has(tx.id)}
                        onCheckedChange={() => toggleSelect(tx.id)}
                        className="h-5 w-5 rounded-md border-white/[0.08] bg-white/[0.03] data-[state=checked]:bg-primary focus-visible:ring-primary shrink-0"
                        aria-label={`Selecionar ${tx.description}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <TransactionCard 
                        transaction={mapToUI(tx)} 
                        onClick={() => selectMode ? toggleSelect(tx.id) : handleTransactionClick(tx)}
                        customCategories={customCategories}
                      />
                    </div>
                  </div>
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

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} gasto{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os gastos selecionados serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Excluir (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
