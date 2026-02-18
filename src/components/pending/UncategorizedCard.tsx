import { useState } from "react";
import { Tag, Sparkles, Plus, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { getCategoryOptionsForPicker, getCategoryDisplay } from "@/lib/categoryResolvers";
import { useHouseholdCategories } from "@/hooks/useHouseholdCategories";
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Transaction } from "@/services/transactionService";
import { createCategorizationRule } from "@/services/categorizationRulesService";
import { updateTransaction } from "@/services/transactionService";
import { merchantFingerprint } from "@/services/categorizationEngine";
import { setCache } from "@/services/merchantCategoryCacheService";
import { useToast } from "@/hooks/use-toast";
import { useHousehold } from "@/hooks/useHousehold";

interface UncategorizedCardProps {
  transactions: Transaction[];
  total: number;
  onCategorizeAll: () => Promise<void>;
  onViewAll: () => void;
  onRefresh: () => void;
  householdId: string;
  isProcessing: boolean;
  progressMessage?: string | null;
}

export function UncategorizedCard({
  transactions,
  total,
  onCategorizeAll,
  onViewAll,
  onRefresh,
  householdId,
  isProcessing,
  progressMessage,
}: UncategorizedCardProps) {
  const { toast } = useToast();
  const { categories: customCategories } = useHouseholdCategories(householdId);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showRuleSheet, setShowRuleSheet] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("other");
  const [rulePattern, setRulePattern] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleQuickCategorize = async (tx: Transaction, category: string) => {
    try {
      await updateTransaction(tx.id, householdId, { category });
      try {
        const fp = merchantFingerprint(tx.description);
        if (fp) await setCache(householdId, fp, category, 1.0);
      } catch (_) { /* cache opcional */ }
      const display = getCategoryDisplay(category, customCategories);
      toast({
        title: "Categorizado!",
        description: `${tx.description} → ${display.label}`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: "Erro ao categorizar",
        variant: "destructive",
      });
    }
  };

  const handleCreateRule = (tx: Transaction) => {
    setSelectedTx(tx);
    setRulePattern(tx.description);
    setSelectedCategory("other");
    setShowRuleSheet(true);
  };

  const handleSaveRule = async () => {
    if (!selectedTx || !rulePattern.trim() || selectedCategory === "other") return;

    setIsSaving(true);
    try {
      await createCategorizationRule(householdId, {
        pattern: rulePattern,
        category: selectedCategory,
        match_type: "contains",
      });

      // Also categorize the current transaction
      await updateTransaction(selectedTx.id, householdId, { category: selectedCategory });

      toast({
        title: "Regra criada!",
        description: `Transações com "${rulePattern}" serão categorizadas automaticamente`,
      });
      setShowRuleSheet(false);
      onRefresh();
    } catch (error) {
      toast({
        title: "Erro ao criar regra",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Math.abs(value));
  };

  const categoryOptions = getCategoryOptionsForPicker(customCategories);
  const categoriesForSelect = categoryOptions.filter((o) => o.value !== "other");

  return (
    <>
      <Card className="border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Tag className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-lg leading-tight">
                  {total} transação(ões) sem categoria
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Info
                </Badge>
              </div>
              <CardDescription className="text-sm">
                Categorize para melhor organização e criação de regras automáticas
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Preview of transactions */}
          <div className="space-y-2">
            {transactions.slice(0, 3).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-border/50"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium text-foreground truncate">
                    {tx.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(tx.amount)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    onValueChange={(value) => handleQuickCategorize(tx, value)}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Categorizar" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span>{opt.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleCreateRule(tx)}
                    title="Criar regra"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {total > 3 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{total - 3} mais transações
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-2">
            <Button
              size="sm"
              onClick={onCategorizeAll}
              disabled={isProcessing}
              className="gap-2 shadow-sm"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {progressMessage || "Categorizar com IA"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onViewAll}
              className="gap-2"
            >
              Ver todas
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Rule Sheet */}
      <Sheet open={showRuleSheet} onOpenChange={setShowRuleSheet}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>Criar Regra Automática</SheetTitle>
            <SheetDescription>
              Transações futuras com texto similar serão categorizadas automaticamente
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Transação original</Label>
              <div className="p-3 rounded-xl bg-muted">
                <p className="text-sm font-medium">{selectedTx?.description}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedTx && formatCurrency(selectedTx.amount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pattern">Padrão de texto</Label>
              <Input
                id="pattern"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                placeholder="Ex: UBER, NETFLIX, MERCADO..."
              />
              <p className="text-xs text-muted-foreground">
                Transações contendo este texto serão categorizadas automaticamente
              </p>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <div className="flex flex-wrap gap-2">
                {categoriesForSelect.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedCategory(opt.value)}
                    className={cn(
                      "transition-all rounded-full",
                      selectedCategory === opt.value && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                  >
                    <CategoryBadge category={opt.value} size="sm" customCategories={customCategories} />
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSaveRule}
              disabled={isSaving || !rulePattern.trim() || selectedCategory === "other"}
              className="w-full"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Criar Regra e Categorizar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
