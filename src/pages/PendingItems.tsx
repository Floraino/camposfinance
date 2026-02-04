import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useHousehold } from "@/hooks/useHousehold";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { 
  getAllPendingItems, 
  deleteDuplicates,
  getUncategorizedTransactions,
  getDuplicateTransactions,
  type PendingSummary, 
  type PendingItem 
} from "@/services/pendingItemsService";
import { recategorizeAllTransactions } from "@/services/categorizationService";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  RefreshCw,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { UncategorizedCard } from "@/components/pending/UncategorizedCard";
import { DuplicatesCard } from "@/components/pending/DuplicatesCard";
import { PendingItemCard } from "@/components/pending/PendingItemCard";
import type { Transaction } from "@/services/transactionService";

export default function PendingItems() {
  const navigate = useNavigate();
  const { currentHousehold, isLoading: householdLoading } = useHousehold();
  const { toast } = useToast();
  
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [uncategorizedTxs, setUncategorizedTxs] = useState<Transaction[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<Transaction[][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | undefined>();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<string[]>([]);

  useEffect(() => {
    if (currentHousehold?.id) {
      loadPendingItems();
    }
  }, [currentHousehold?.id]);

  const loadPendingItems = async () => {
    if (!currentHousehold?.id) return;
    
    setIsLoading(true);
    try {
      const [summaryData, uncategorized, duplicates] = await Promise.all([
        getAllPendingItems(currentHousehold.id),
        getUncategorizedTransactions(currentHousehold.id),
        getDuplicateTransactions(currentHousehold.id),
      ]);
      setSummary(summaryData);
      setUncategorizedTxs(uncategorized);
      setDuplicateGroups(duplicates);
    } catch (error) {
      console.error("Error loading pending items:", error);
      toast({
        title: "Erro ao carregar pendências",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorizeAll = async () => {
    setIsProcessing(true);
    setProcessingAction("categorize_all");
    try {
      const result = await recategorizeAllTransactions();
      toast({
        title: "Categorização concluída",
        description: `${result.updated} transação(ões) atualizada(s)`,
      });
      await loadPendingItems();
    } catch (error) {
      toast({
        title: "Erro ao categorizar",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingAction(undefined);
    }
  };

  const handleDeleteDuplicates = async (ids: string[]) => {
    if (!currentHousehold?.id || ids.length === 0) return;

    setSelectedDuplicates(ids);
    setShowDeleteDialog(true);
  };

  const confirmDeleteDuplicates = async () => {
    if (!currentHousehold?.id || selectedDuplicates.length === 0) return;

    setIsProcessing(true);
    try {
      const deleted = await deleteDuplicates(currentHousehold.id, selectedDuplicates);
      toast({
        title: "Duplicatas removidas",
        description: `${deleted} transação(ões) apagada(s)`,
      });
      setShowDeleteDialog(false);
      setSelectedDuplicates([]);
      await loadPendingItems();
    } catch (error) {
      toast({
        title: "Erro ao remover duplicatas",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemAction = async (item: PendingItem, action: string) => {
    if (action.startsWith("view_split:")) {
      navigate("/splits");
    } else if (action === "renew_pro") {
      navigate("/subscribe");
    }
  };

  // Filter out uncategorized and duplicate items from the main list
  // since they have dedicated cards
  const otherItems = summary?.items.filter(
    (item) => item.type !== "uncategorized" && item.type !== "duplicate"
  ) || [];

  if (householdLoading || isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  const hasNoPendingItems = 
    uncategorizedTxs.length === 0 && 
    duplicateGroups.length === 0 && 
    otherItems.length === 0;

  return (
    <MobileLayout>
      <div className="px-4 pt-safe pb-24">
        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pendências</h1>
            <p className="text-sm text-muted-foreground">
              {hasNoPendingItems 
                ? "Tudo em dia! 🎉" 
                : `${(summary?.total || 0)} item(ns) para revisar`}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={loadPendingItems}
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
          </Button>
        </header>

        {/* Pending Items */}
        <div className="space-y-4">
          {/* Uncategorized Card */}
          {uncategorizedTxs.length > 0 && currentHousehold && (
            <UncategorizedCard
              transactions={uncategorizedTxs}
              total={uncategorizedTxs.length}
              onCategorizeAll={handleCategorizeAll}
              onViewAll={() => navigate("/transactions?filter=uncategorized")}
              onRefresh={loadPendingItems}
              householdId={currentHousehold.id}
              isProcessing={isProcessing && processingAction === "categorize_all"}
            />
          )}

          {/* Duplicates Card */}
          {duplicateGroups.length > 0 && (
            <DuplicatesCard
              groups={duplicateGroups}
              totalDuplicates={duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0)}
              onDeleteSelected={handleDeleteDuplicates}
              isProcessing={isProcessing}
            />
          )}

          {/* Other Pending Items */}
          {otherItems.map((item) => (
            <PendingItemCard
              key={item.id}
              item={item}
              onAction={(action) => handleItemAction(item, action)}
              isProcessing={isProcessing}
              processingAction={processingAction}
            />
          ))}
        </div>

        {/* Empty State */}
        {hasNoPendingItems && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Tudo em dia!
            </h3>
            <p className="text-sm text-muted-foreground">
              Não há pendências para revisar no momento.
            </p>
          </div>
        )}
      </div>

      {/* Delete Duplicates Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover duplicatas?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedDuplicates.length} transação(ões) serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDuplicates}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Remover {selectedDuplicates.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
