import { useState, useEffect } from "react";
import { X, Plus, Trash2, Loader2, Edit2, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { useHouseholdCategories } from "@/hooks/useHouseholdCategories";
import { getCategoryOptionsForPicker } from "@/lib/categoryResolvers";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getCategorizationRules,
  createCategorizationRule,
  updateCategorizationRule,
  deleteCategorizationRule,
  type CategorizationRule,
} from "@/services/categorizationRulesService";

interface CategorizationRulesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  householdId: string;
}

export function CategorizationRulesSheet({ isOpen, onClose, householdId }: CategorizationRulesSheetProps) {
  const { toast } = useToast();
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "starts_with" | "exact">("contains");
  const [category, setCategory] = useState<string>("other");
  const { categories: customCategories, createCategory } = useHouseholdCategories(householdId);

  useEffect(() => {
    if (isOpen && householdId) {
      loadRules();
    }
  }, [isOpen, householdId]);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const data = await getCategorizationRules(householdId);
      setRules(data);
    } catch (error) {
      console.error("Error loading rules:", error);
      toast({
        title: "Erro ao carregar regras",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setPattern("");
    setMatchType("contains");
    setCategory("other");
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!pattern.trim()) {
      toast({
        title: "Padrão obrigatório",
        description: "Digite um texto para a regra",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateCategorizationRule(editingId, householdId, {
          pattern,
          match_type: matchType,
          category,
        });
        toast({ title: "Regra atualizada!" });
      } else {
        await createCategorizationRule(householdId, {
          pattern,
          match_type: matchType,
          category,
        });
        toast({ title: "Regra criada!" });
      }
      resetForm();
      await loadRules();
    } catch (error) {
      toast({
        title: "Erro ao salvar regra",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (rule: CategorizationRule) => {
    setPattern(rule.pattern);
    setMatchType(rule.match_type);
    setCategory(rule.category);
    setEditingId(rule.id);
    setShowAddForm(true);
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteCategorizationRule(ruleId, householdId);
      toast({ title: "Regra removida" });
      await loadRules();
    } catch (error) {
      toast({
        title: "Erro ao remover regra",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (rule: CategorizationRule) => {
    try {
      await updateCategorizationRule(rule.id, householdId, {
        is_active: !rule.is_active,
      });
      await loadRules();
    } catch (error) {
      toast({
        title: "Erro ao atualizar regra",
        variant: "destructive",
      });
    }
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
          <div>
            <h2 className="text-xl font-bold text-foreground">Regras Automáticas</h2>
            <p className="text-sm text-muted-foreground">Categorize lançamentos automaticamente</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4 pb-safe">
          {/* Add/Edit Form */}
          {showAddForm ? (
            <div className="glass-card p-4 space-y-4">
              <div>
                <Label>Padrão de texto</Label>
                <Input
                  placeholder="Ex: UBER, IFOOD, NETFLIX..."
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Tipo de correspondência</Label>
                <Select value={matchType} onValueChange={(v) => setMatchType(v as typeof matchType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="starts_with">Começa com</SelectItem>
                    <SelectItem value="exact">Exato</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Categoria</Label>
                <CategoryPicker
                  value={category}
                  onChange={setCategory}
                  customCategories={customCategories}
                  onAddCustom={async (name, color) => createCategory({ name, color })}
                  size="sm"
                  className="mt-2"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={resetForm}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4" />
              Nova Regra
            </Button>
          )}

          {/* Rules List */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                Nenhuma regra criada ainda
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie regras para categorizar automaticamente
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={cn(
                    "glass-card p-4 flex items-center gap-3",
                    !rule.is_active && "opacity-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium text-foreground truncate">
                        {rule.pattern}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({rule.match_type === "contains" ? "contém" : 
                          rule.match_type === "starts_with" ? "começa" : "exato"})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={rule.category} size="sm" customCategories={customCategories} />
                      {rule.times_applied > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {rule.times_applied}x usada
                        </span>
                      )}
                    </div>
                  </div>

                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={() => handleToggleActive(rule)}
                  />

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleEdit(rule)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(rule.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
