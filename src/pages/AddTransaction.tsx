import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addTransaction, type NewTransaction } from "@/services/transactionService";
import { AddTransactionSheet } from "@/components/transactions/AddTransactionSheet";
import { useToast } from "@/hooks/use-toast";

export default function AddTransaction() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isOpen] = useState(true);

  const handleClose = () => {
    navigate(-1);
  };

  const handleAdd = async (tx: NewTransaction) => {
    try {
      await addTransaction(tx);
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

  return (
    <div className="min-h-screen bg-background">
      <AddTransactionSheet
        isOpen={isOpen}
        onClose={handleClose}
        onAdd={handleAdd}
      />
    </div>
  );
}
