import { useState, useMemo } from "react";
import { Tag, Shield, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface CategorizeSuggestion {
  transaction_id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  confidence: number;
  reason?: string;
}

export interface CategorizePreviewPayload {
  householdId: string;
  householdName: string;
  suggestions: CategorizeSuggestion[];
}

const CONFIDENCE_THRESHOLD = 0.8;

interface CategorizePreviewModalProps {
  payload: CategorizePreviewPayload | null;
  open: boolean;
  onConfirm: (updates: Array<{ id: string; category: CategoryType }>) => void;
  onCancel: () => void;
  isApplying?: boolean;
}

export function CategorizePreviewModal({
  payload,
  open,
  onConfirm,
  onCancel,
  isApplying = false,
}: CategorizePreviewModalProps) {
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suggestions = payload?.suggestions ?? [];
  const validCategories = Object.keys(categoryConfig) as CategoryType[];

  const highConfidenceIds = useMemo(
    () => new Set(suggestions.filter((s) => s.confidence >= CONFIDENCE_THRESHOLD).map((s) => s.transaction_id)),
    [suggestions]
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllHighConfidence = () => {
    setSelected(highConfidenceIds);
  };

  const selectAll = () => {
    setSelected(new Set(suggestions.map((s) => s.transaction_id)));
  };

  const handleApplySelected = () => {
    const updates = suggestions
      .filter((s) => selected.has(s.transaction_id))
      .filter((s) => validCategories.includes(s.category as CategoryType))
      .map((s) => ({ id: s.transaction_id, category: s.category as CategoryType }));
    onConfirm(updates);
  };

  const handleApplyHighConfidence = () => {
    const updates = suggestions
      .filter((s) => s.confidence >= CONFIDENCE_THRESHOLD)
      .filter((s) => validCategories.includes(s.category as CategoryType))
      .map((s) => ({ id: s.transaction_id, category: s.category as CategoryType }));
    onConfirm(updates);
  };

  const formatDate = (d: string) => {
    try {
      const [y, m, day] = d.split("-");
      return day && m && y ? `${day}/${m}/${y}` : d;
    } catch {
      return d;
    }
  };

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className={cn("max-w-[95vw]", isMobile ? "max-h-[90vh]" : "max-w-2xl")}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-accent/10">
              <Tag className="w-5 h-5 text-accent" />
            </div>
            <div>
              <DialogTitle>Categorizar gastos sem categoria</DialogTitle>
              <DialogDescription>
                {payload.householdName} · {suggestions.length} sugestão(ões). Revise e confirme para aplicar.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Shield className="w-3.5 h-3.5" />
            Modo Seguro: nada é alterado até você confirmar.
          </div>
        </DialogHeader>

        <div className="overflow-auto max-h-[50vh] rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"> </TableHead>
                <TableHead>Descrição</TableHead>
                {!isMobile && <TableHead>Data</TableHead>}
                {!isMobile && <TableHead className="text-right">Valor</TableHead>}
                <TableHead>Sugestão</TableHead>
                {!isMobile && <TableHead className="text-right">Conf.</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => (
                <TableRow key={s.transaction_id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(s.transaction_id)}
                      onCheckedChange={() => toggleOne(s.transaction_id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium max-w-[180px] truncate" title={s.description}>
                    {s.description || "—"}
                  </TableCell>
                  {!isMobile && (
                    <>
                      <TableCell className="text-muted-foreground">{formatDate(s.date)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        R$ {Math.abs(s.amount).toFixed(2)}
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    {validCategories.includes(s.category as CategoryType) ? (
                      <CategoryBadge category={s.category as CategoryType} size="sm" />
                    ) : (
                      <span className="text-muted-foreground text-xs">{s.category}</span>
                    )}
                  </TableCell>
                  {!isMobile && (
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          s.confidence >= CONFIDENCE_THRESHOLD ? "text-green-600" : "text-amber-600"
                        )}
                      >
                        {Math.round(s.confidence * 100)}%
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllHighConfidence}
              disabled={highConfidenceIds.size === 0 || isApplying}
            >
              Selecionar conf. ≥ 80%
            </Button>
            <Button variant="outline" size="sm" onClick={selectAll} disabled={!suggestions.length || isApplying}>
              Selecionar todas
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={isApplying}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={handleApplyHighConfidence}
              disabled={highConfidenceIds.size === 0 || isApplying}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Aplicar todas (≥80%)
            </Button>
            <Button
              onClick={handleApplySelected}
              disabled={selected.size === 0 || isApplying}
            >
              {isApplying ? "Aplicando…" : `Aplicar selecionadas (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
