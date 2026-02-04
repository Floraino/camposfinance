import { useState } from "react";
import { Copy, Trash2, Eye, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Transaction } from "@/services/transactionService";

interface DuplicatesCardProps {
  groups: Transaction[][];
  totalDuplicates: number;
  onDeleteSelected: (ids: string[]) => void;
  isProcessing: boolean;
}

export function DuplicatesCard({
  groups,
  totalDuplicates,
  onDeleteSelected,
  isProcessing,
}: DuplicatesCardProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleGroup = (index: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleTransaction = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllDuplicates = () => {
    const idsToSelect: string[] = [];
    groups.forEach((group) => {
      // Select all except the first (oldest) in each group
      group.slice(1).forEach((tx) => idsToSelect.push(tx.id));
    });
    setSelectedIds(new Set(idsToSelect));
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    onDeleteSelected(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Math.abs(value));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Copy className="w-6 h-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-lg leading-tight">
                {totalDuplicates} possível(eis) duplicata(s)
              </CardTitle>
              <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                Atenção
              </Badge>
            </div>
            <CardDescription className="text-sm">
              {groups.length} grupo(s) de transações similares encontrados
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Groups preview */}
        <div className="space-y-3">
          {groups.slice(0, 3).map((group, groupIndex) => (
            <div
              key={groupIndex}
              className="rounded-xl bg-background/50 border border-border/50 overflow-hidden"
            >
              <button
                onClick={() => toggleGroup(groupIndex)}
                className="w-full flex items-center justify-between p-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {group[0].description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(group[0].amount)} • {group.length} transações idênticas
                  </p>
                </div>
                {expandedGroups.has(groupIndex) ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>

              {expandedGroups.has(groupIndex) && (
                <div className="px-3 pb-3 space-y-2">
                  {group.map((tx, txIndex) => (
                    <div
                      key={tx.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg",
                        txIndex === 0 ? "bg-success/10 border border-success/20" : "bg-muted/50"
                      )}
                    >
                      {txIndex === 0 ? (
                        <div className="w-5 h-5 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-success" />
                        </div>
                      ) : (
                        <Checkbox
                          checked={selectedIds.has(tx.id)}
                          onCheckedChange={() => toggleTransaction(tx.id)}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.transaction_date)}
                          {txIndex === 0 && (
                            <span className="ml-2 text-success font-medium">(Manter)</span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-medium">
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {groups.length > 3 && (
            <p className="text-xs text-muted-foreground text-center">
              +{groups.length - 3} mais grupos
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap pt-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={isProcessing || selectedIds.size === 0}
            className="gap-2 shadow-sm"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Remover {selectedIds.size > 0 ? `(${selectedIds.size})` : "selecionados"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={selectAllDuplicates}
            className="gap-2"
          >
            Selecionar duplicatas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
