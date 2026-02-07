import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { addTransaction, type NewTransaction } from "@/services/transactionService";
import { AddTransactionSheet } from "@/components/transactions/AddTransactionSheet";
import { useToast } from "@/hooks/use-toast";
import { useHousehold } from "@/hooks/useHousehold";
import { Loader2 } from "lucide-react";

export default function AddTransaction() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentHousehold, hasSelectedHousehold, isLoading } = useHousehold();
  const [isOpen] = useState(true);

  // Redirect to household selection if no household selected
  useEffect(() => {
    if (!isLoading && !hasSelectedHousehold) {
      navigate("/select-household");
    }
  }, [isLoading, hasSelectedHousehold, navigate]);

  const handleClose = () => {
    navigate(-1);
  };

  const handleAdd = async (tx: NewTransaction) => {
    if (!currentHousehold?.id) return;

    try {
      await addTransaction(currentHousehold.id, tx);
      queryClient.invalidateQueries({ queryKey: ["accounts", currentHousehold.id] });
      toast({
        title: "Gasto adicionado!",
        description: `${tx.description} foi registrado com sucesso.`,
      });
      navigate("/");
    } catch (error) {
      console.error("Error adding transaction:", error);
      toast({
        title: "Erro ao adicionar",
        description: "Não foi possível salvar o gasto",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !currentHousehold) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AddTransactionSheet
        isOpen={isOpen}
        onClose={handleClose}
        onAdd={handleAdd}
        householdId={currentHousehold.id}
      />
    </div>
  );
}
