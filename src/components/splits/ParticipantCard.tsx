import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { 
  MoreVertical, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  CreditCard,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type SplitParticipant,
  updateSplitParticipant,
  removeSplitParticipant,
  markParticipantAsPaid,
} from "@/services/splitService";

interface ParticipantCardProps {
  participant: SplitParticipant;
  totalShares: number;
  currency: string;
  canEdit: boolean;
  canMarkPaid: boolean;
  onUpdated: () => void;
}

const paymentStatusConfig = {
  UNPAID: { label: "Pendente", icon: Clock, color: "text-amber-500" },
  PARTIAL: { label: "Parcial", icon: AlertCircle, color: "text-orange-500" },
  PAID: { label: "Pago", icon: CheckCircle, color: "text-green-500" },
};

export function ParticipantCard({
  participant,
  totalShares,
  currency,
  canEdit,
  canMarkPaid,
  onUpdated,
}: ParticipantCardProps) {
  const { toast } = useToast();
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeSplitParticipant(participant.id);
      toast({
        title: "Participante removido",
        description: "A família foi removida do rateio.",
      });
      onUpdated();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover o participante",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleMarkPaid = async () => {
    const amount = parseFloat(paymentAmount.replace(/[^\d,.-]/g, "").replace(",", "."));
    
    if (isNaN(amount) || amount < 0) {
      toast({
        title: "Erro",
        description: "Informe um valor válido",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingPayment(true);
    try {
      await markParticipantAsPaid(participant.id, amount);
      toast({
        title: "Pagamento registrado!",
        description: `Pagamento de ${formatCurrency(amount)} registrado.`,
      });
      setPaymentDialogOpen(false);
      setPaymentAmount("");
      onUpdated();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível registrar o pagamento",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const statusConfig = paymentStatusConfig[participant.payment_status];
  const StatusIcon = statusConfig.icon;

  return (
    <>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">
                  {participant.household_name || "Família"}
                </h4>
                <Badge variant="outline" className="shrink-0">
                  {participant.shares}/{totalShares}
                </Badge>
              </div>
              
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold">
                  {formatCurrency(participant.amount_calculated)}
                </span>
                <span className={`flex items-center gap-1 ${statusConfig.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusConfig.label}
                </span>
              </div>

              {participant.payment_status !== "UNPAID" && participant.paid_amount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Pago: {formatCurrency(participant.paid_amount)}
                </p>
              )}
            </div>

            {(canEdit || canMarkPaid) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canMarkPaid && (
                    <DropdownMenuItem onClick={() => {
                      setPaymentAmount(participant.amount_calculated.toString());
                      setPaymentDialogOpen(true);
                    }}>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Registrar Pagamento
                    </DropdownMenuItem>
                  )}
                  {canEdit && (
                    <DropdownMenuItem 
                      onClick={() => setDeleteDialogOpen(true)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remover
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover participante?</AlertDialogTitle>
            <AlertDialogDescription>
              A família {participant.household_name} será removida deste rateio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Remover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">Família</p>
              <p className="font-semibold">{participant.household_name}</p>
            </div>
            
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">Valor esperado</p>
              <p className="font-semibold">{formatCurrency(participant.amount_calculated)}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Valor pago (R$)</label>
              <Input
                type="text"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleMarkPaid} disabled={isUpdatingPayment}>
              {isUpdatingPayment ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Confirmar Pagamento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
