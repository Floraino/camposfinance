import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Split, Users, ChevronRight } from "lucide-react";
import { type SplitEvent } from "@/services/splitService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SplitCardProps {
  split: SplitEvent;
  onClick: () => void;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  ACTIVE: { label: "Ativo", variant: "default" },
  CLOSED: { label: "Encerrado", variant: "outline" },
};

export function SplitCard({ split, onClick }: SplitCardProps) {
  const statusInfo = statusLabels[split.status] || statusLabels.DRAFT;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: split.currency || "BRL",
    }).format(value);
  };

  return (
    <Card 
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <Split className="w-5 h-5 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{split.title}</h3>
                <Badge variant={statusInfo.variant} className="shrink-0">
                  {statusInfo.label}
                </Badge>
              </div>
              
              {split.description && (
                <p className="text-sm text-muted-foreground truncate mb-2">
                  {split.description}
                </p>
              )}
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {formatCurrency(split.total_amount)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {split.total_shares} cotas
                </span>
              </div>
              
              <p className="text-xs text-muted-foreground mt-2">
                Criado em {format(new Date(split.created_at), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
          
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}
