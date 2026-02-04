import { useState, useEffect } from "react";
import { X, Plus, Trash2, Loader2, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getCategoryBudgetsWithSpending,
  setCategoryBudget,
  deleteCategoryBudget,
  type CategoryBudgetWithSpending,
} from "@/services/categoryBudgetService";

interface CategoryBudgetsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  householdId: string;
}

export function CategoryBudgetsSheet({ isOpen, onClose, householdId }: CategoryBudgetsSheetProps) {
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<CategoryBudgetWithSpending[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const [amount, setAmount] = useState("");

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  useEffect(() => {
    if (isOpen && householdId) {
      loadBudgets();
    }
  }, [isOpen, householdId]);

  const loadBudgets = async () => {
    setIsLoading(true);
    try {
      const data = await getCategoryBudgetsWithSpending(householdId, currentMonth, currentYear);
      setBudgets(data);
    } catch (error) {
      console.error("Error loading category budgets:", error);
      toast({
        title: "Erro ao carregar metas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory(null);
    setAmount("");
    setShowAddForm(false);
  };

  const handleSave = async () => {
    if (!selectedCategory || !amount) {
      toast({
        title: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Valor inválido",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await setCategoryBudget(householdId, {
        category: selectedCategory,
        amount: parsedAmount,
        month: currentMonth,
        year: currentYear,
      });
      toast({ title: "Meta definida!" });
      resetForm();
      await loadBudgets();
    } catch (error) {
      toast({
        title: "Erro ao salvar meta",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (budget: CategoryBudgetWithSpending) => {
    try {
      await deleteCategoryBudget(budget.id, householdId);
      toast({ title: "Meta removida" });
      await loadBudgets();
    } catch (error) {
      toast({
        title: "Erro ao remover meta",
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

  const categoriesWithBudget = new Set(budgets.map(b => b.category));
  const availableCategories = (Object.keys(categoryConfig) as CategoryType[])
    .filter(cat => !categoriesWithBudget.has(cat));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">Metas por Categoria</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(currentYear, currentMonth - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4 pb-safe">
          {/* Add Form */}
          {showAddForm ? (
            <div className="glass-card p-4 space-y-4">
              <div>
                <Label>Categoria</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "transition-all duration-200",
                        selectedCategory === cat && "ring-2 ring-primary ring-offset-2 ring-offset-card rounded-full"
                      )}
                    >
                      <CategoryBadge category={cat} size="sm" />
                    </button>
                  ))}
                </div>
                {availableCategories.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Todas as categorias já têm metas definidas
                  </p>
                )}
              </div>

              <div>
                <Label>Limite mensal</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    R$
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSave}
                  disabled={isSaving || !selectedCategory || !amount}
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Definir Meta
                </Button>
              </div>
            </div>
          ) : availableCategories.length > 0 && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4" />
              Nova Meta
            </Button>
          )}

          {/* Budgets List */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : budgets.length === 0 ? (
            <div className="text-center py-8">
              <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                Nenhuma meta definida
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Defina limites para controlar seus gastos
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {budgets.map((budget) => (
                <div
                  key={budget.id}
                  className={cn(
                    "glass-card p-4",
                    budget.status === "exceeded" && "border-destructive/50",
                    budget.status === "warning" && "border-warning/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <CategoryBadge category={budget.category} size="md" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(budget)}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(budget.spent)} de {formatCurrency(budget.amount)}
                    </span>
                    <span className={cn(
                      "text-sm font-medium",
                      budget.status === "safe" && "text-success",
                      budget.status === "warning" && "text-warning",
                      budget.status === "exceeded" && "text-destructive"
                    )}>
                      {Math.round(budget.percentage)}%
                    </span>
                  </div>

                  <Progress 
                    value={Math.min(budget.percentage, 100)} 
                    className={cn(
                      "h-2",
                      budget.status === "exceeded" && "[&>div]:bg-destructive",
                      budget.status === "warning" && "[&>div]:bg-warning"
                    )}
                  />

                  {budget.status === "exceeded" && (
                    <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Excedido em {formatCurrency(budget.spent - budget.amount)}
                    </p>
                  )}
                  {budget.status === "warning" && (
                    <p className="text-xs text-warning mt-2">
                      ⚠️ Atenção: {budget.alert_threshold}% do limite atingido
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
