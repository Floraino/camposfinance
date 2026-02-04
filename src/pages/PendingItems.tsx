import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useHousehold } from "@/hooks/useHousehold";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { 
  getAllPendingItems, 
  deleteDuplicates,
  type PendingSummary, 
  type PendingItem 
} from "@/services/pendingItemsService";
import { recategorizeAllTransactions } from "@/services/categorizationService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Tag, 
  Copy, 
  Users, 
  Crown, 
  Loader2, 
  RefreshCw,
  ChevronRight,
  Sparkles,
  Trash2
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

const iconMap = {
  uncategorized: Tag,
  duplicate: Copy,
  pending_split: Users,
  pro_expiring: Crown,
  no_account: AlertTriangle,
};

const severityColors = {
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function PendingItems() {
  const navigate = useNavigate();
  const { currentHousehold, isLoading: householdLoading } = useHousehold();
  const { toast } = useToast();
  
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
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
      const data = await getAllPendingItems(currentHousehold.id);
      setSummary(data);
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

  const handleAction = async (item: PendingItem, action: string) => {
    if (action === "categorize_all") {
      setIsProcessing(true);
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
      }
    } else if (action === "view_uncategorized") {
      navigate("/transactions?filter=uncategorized");
    } else if (action === "review_duplicates") {
      // Show duplicates for deletion
      const groups = item.data?.groups as Array<Array<{ id: string }>>;
      if (groups) {
        // Get all IDs except the first of each group (keep first, suggest deleting rest)
        const toDelete = groups.flatMap(group => group.slice(1).map(tx => tx.id));
        setSelectedDuplicates(toDelete);
        setShowDeleteDialog(true);
      }
    } else if (action.startsWith("view_split:")) {
      navigate("/splits");
    } else if (action === "renew_pro") {
      navigate("/subscribe");
    }
  };

  const handleDeleteDuplicates = async () => {
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

  if (householdLoading || isLoading) {
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
      <div className="px-4 pt-safe pb-24">
        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pendências</h1>
            <p className="text-sm text-muted-foreground">
              {summary?.total === 0 
                ? "Tudo em dia! 🎉" 
                : `${summary?.total} item(ns) para revisar`}
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

        {/* Summary Cards */}
        {summary && summary.total > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {Object.entries(summary.byType).map(([type, count]) => {
              const Icon = iconMap[type as keyof typeof iconMap] || AlertTriangle;
              return (
                <Card key={type} className="glass-card">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{count}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {type.replace("_", " ")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pending Items List */}
        <div className="space-y-4">
          {summary?.items.map((item) => {
            const Icon = iconMap[item.type as keyof typeof iconMap] || AlertTriangle;
            
            return (
              <Card 
                key={item.id} 
                className={cn("glass-card border", severityColors[item.severity])}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      item.severity === "warning" && "bg-amber-500/20",
                      item.severity === "error" && "bg-destructive/20",
                      item.severity === "info" && "bg-blue-500/20",
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {item.actions && item.actions.length > 0 && (
                  <CardContent className="pt-2">
                    <div className="flex gap-2 flex-wrap">
                      {item.actions.map((action, idx) => (
                        <Button
                          key={idx}
                          size="sm"
                          variant={action.variant === "destructive" ? "destructive" : "secondary"}
                          onClick={() => handleAction(item, action.action)}
                          disabled={isProcessing}
                          className="gap-1"
                        >
                          {isProcessing && action.action === "categorize_all" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : action.action === "categorize_all" ? (
                            <Sparkles className="w-3 h-3" />
                          ) : null}
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {summary?.total === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-success" />
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
              {selectedDuplicates.length} transação(ões) serão removidas. 
              A primeira de cada grupo será mantida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDuplicates}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Remover {selectedDuplicates.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
