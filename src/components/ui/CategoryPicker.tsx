import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { getCategoryOptionsForPicker } from "@/lib/categoryResolvers";
import type { HouseholdCategory } from "@/services/householdCategoriesService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DEFAULT_CUSTOM_COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#F97316", "#10B981", "#3B82F6", "#14B8A6", "#EAB308",
];

interface CategoryPickerProps {
  value: string;
  onChange: (category: string) => void;
  customCategories: HouseholdCategory[];
  onAddCustom?: (name: string, color?: string) => Promise<HouseholdCategory | null>;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CategoryPicker({
  value,
  onChange,
  customCategories,
  onAddCustom,
  size = "md",
  className,
}: CategoryPickerProps) {
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CUSTOM_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const options = getCategoryOptionsForPicker(customCategories);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !onAddCustom) return;
    if (name.length > 32) return;
    setIsSubmitting(true);
    try {
      const created = await onAddCustom(name, newColor);
      if (created) {
        onChange(`custom:${created.id}`);
        setNewName("");
        setNewColor(DEFAULT_CUSTOM_COLORS[0]);
        setNewCategoryOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "transition-all duration-200 rounded-full",
            value === opt.value && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
        >
          <CategoryBadge
            category={opt.value}
            size={size}
            customCategories={customCategories}
          />
        </button>
      ))}
      {onAddCustom && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full gap-1"
            onClick={() => setNewCategoryOpen(true)}
          >
            <Plus className="w-4 h-4" />
            Nova categoria
          </Button>
          <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
                <DialogDescription>
                  Categoria só aparecerá para esta família.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Nome</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.slice(0, 32))}
                    placeholder="Ex: Pet, Assinaturas"
                    maxLength={32}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Cor</label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_CUSTOM_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setNewColor(hex)}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-all",
                          newColor === hex ? "border-foreground scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewCategoryOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
