import { useState, useEffect } from "react";
import { X, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentBudget, setBudget, type Budget } from "@/services/budgetService";
import { useToast } from "@/hooks/use-toast";

interface BudgetSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onBudgetUpdated?: () => void;
}

export function BudgetSheet({ isOpen, onClose, onBudgetUpdated }: BudgetSheetProps) {
  const [amount, setAmount] = useState("");
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadCurrentBudget();
    }
  }, [isOpen]);

  const loadCurrentBudget = async () => {
    try {
      const budget = await getCurrentBudget("monthly");
      setCurrentBudget(budget);
      if (budget) {
        setAmount(budget.amount.toString().replace(".", ","));
      } else {
        setAmount("");
      }
    } catch (error) {
      console.error("Error loading budget:", error);
    }
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: "Valor inválido",
        description: "Digite um valor válido para o orçamento",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await setBudget(numAmount, "monthly");
      toast({
        title: "Orçamento salvo!",
        description: "Orçamento mensal definido com sucesso.",
      });
      onBudgetUpdated?.();
      onClose();
    } catch (error) {
      console.error("Error saving budget:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o orçamento",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

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
          <h2 className="text-xl font-bold text-foreground">Orçamento Mensal</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4 space-y-6 pb-safe">
          {/* Current Budget Info */}
          {currentBudget && (
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Orçamento atual</p>
                <p className="font-semibold text-foreground">
                  {formatCurrency(currentBudget.amount)}
                </p>
              </div>
            </div>
          )}
          
          {/* Amount Input */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Valor do Orçamento
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mobile-input pl-12 text-2xl font-bold"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Quanto você pode gastar neste mês?
            </p>
          </div>
          
          {/* Save Button */}
          <Button 
            variant="accent" 
            size="lg" 
            className="w-full"
            onClick={handleSave}
            disabled={!amount || isLoading}
          >
            {isLoading ? "Salvando..." : "Salvar Orçamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
