import { cn } from "@/lib/utils";
import { CategoryIcon, type CategoryType } from "@/components/ui/CategoryBadge";
import { Check, Clock, RefreshCw } from "lucide-react";

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: CategoryType;
  paymentMethod: "pix" | "boleto" | "card" | "cash";
  status: "paid" | "pending";
  isRecurring?: boolean;
  member?: string;
}

interface TransactionCardProps {
  transaction: Transaction;
  onClick?: () => void;
}

export function TransactionCard({ transaction, onClick }: TransactionCardProps) {
  const { description, amount, date, category, status, isRecurring } = transaction;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    }).format(date);
  };

  return (
    <button
      onClick={onClick}
      className="transaction-card w-full text-left"
    >
      <CategoryIcon category={category} size="md" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">{description}</p>
          {isRecurring && (
            <RefreshCw className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{formatDate(date)}</span>
          {status === "pending" && (
            <span className="flex items-center gap-1 text-xs text-warning">
              <Clock className="w-3 h-3" />
              Pendente
            </span>
          )}
          {status === "paid" && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="w-3 h-3" />
              Pago
            </span>
          )}
        </div>
      </div>
      
      <p className={cn(
        "font-semibold text-right",
        amount < 0 ? "text-destructive" : "text-success"
      )}>
        {formatCurrency(amount)}
      </p>
    </button>
  );
}
