import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { AddTransactionSheet, type NewTransaction } from "@/components/transactions/AddTransactionSheet";
import { useNavigate } from "react-router-dom";

export default function AddTransaction() {
  const navigate = useNavigate();
  const [isOpen] = useState(true);

  const handleClose = () => {
    navigate(-1);
  };

  const handleAdd = (tx: NewTransaction) => {
    console.log("Nova transação:", tx);
    // Aqui você salvaria no banco de dados
    navigate("/");
  };

  return (
    <MobileLayout hideNav>
      <AddTransactionSheet
        isOpen={isOpen}
        onClose={handleClose}
        onAdd={handleAdd}
      />
    </MobileLayout>
  );
}
