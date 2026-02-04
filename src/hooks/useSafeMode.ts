import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  previewDeletion,
  deleteTransactionsBatch,
  PreviewDeletionParams,
  PreviewDeletionResult,
  BatchDeleteResult,
} from "@/services/destructiveActionsService";
import { DestructiveActionPreview } from "@/components/assistant/DestructiveActionConfirmation";

interface UseSafeModeResult {
  isConfirmationOpen: boolean;
  currentPreview: DestructiveActionPreview | null;
  isLoading: boolean;
  requestDeletion: (params: PreviewDeletionParams) => Promise<void>;
  confirmDeletion: (preview: DestructiveActionPreview) => Promise<BatchDeleteResult>;
  cancelDeletion: () => void;
  safeModeEnabled: boolean;
  setSafeModeEnabled: (enabled: boolean) => void;
}

export function useSafeMode(): UseSafeModeResult {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [currentPreview, setCurrentPreview] = useState<DestructiveActionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [safeModeEnabled, setSafeModeEnabled] = useState(true);
  const { toast } = useToast();

  const requestDeletion = useCallback(async (params: PreviewDeletionParams) => {
    setIsLoading(true);
    try {
      const result: PreviewDeletionResult = await previewDeletion(params);
      
      if (result.count === 0) {
        toast({
          title: "Nenhum lançamento encontrado",
          description: "Não há lançamentos para excluir com os filtros selecionados.",
        });
        return;
      }

      const preview: DestructiveActionPreview = {
        actionType: "delete_transactions",
        count: result.count,
        transactionIds: result.transactionIds,
        householdName: result.householdName,
        householdId: params.householdId,
        rangeLabel: result.rangeLabel,
        sumAmount: result.sumAmount,
        topCategories: result.topCategories,
      };

      setCurrentPreview(preview);
      setIsConfirmationOpen(true);
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao buscar lançamentos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const confirmDeletion = useCallback(async (preview: DestructiveActionPreview): Promise<BatchDeleteResult> => {
    setIsLoading(true);
    try {
      const result = await deleteTransactionsBatch({
        householdId: preview.householdId,
        transactionIds: preview.transactionIds,
      });

      setIsConfirmationOpen(false);
      setCurrentPreview(null);

      if (result.success) {
        toast({
          title: "Sucesso!",
          description: result.message,
        });
      } else {
        toast({
          title: "Atenção",
          description: result.message,
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      const errorResult: BatchDeleteResult = {
        requestedCount: preview.count,
        deletedCount: 0,
        failedIds: preview.transactionIds.map(id => ({ id, reason: "Erro desconhecido" })),
        success: false,
        message: error instanceof Error ? error.message : "Erro ao excluir lançamentos",
      };

      toast({
        title: "Erro",
        description: errorResult.message,
        variant: "destructive",
      });

      return errorResult;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const cancelDeletion = useCallback(() => {
    setIsConfirmationOpen(false);
    setCurrentPreview(null);
  }, []);

  return {
    isConfirmationOpen,
    currentPreview,
    isLoading,
    requestDeletion,
    confirmDeletion,
    cancelDeletion,
    safeModeEnabled,
    setSafeModeEnabled,
  };
}
