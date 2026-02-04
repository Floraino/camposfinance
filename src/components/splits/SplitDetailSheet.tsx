import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  Loader2, 
  Plus, 
  Trash2, 
  PlayCircle, 
  StopCircle,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import {
  getSplitEvent,
  getSplitParticipants,
  updateSplitEvent,
  deleteSplitEvent,
  type SplitEvent,
  type SplitParticipant,
} from "@/services/splitService";
import { AddParticipantSheet } from "./AddParticipantSheet";
import { ParticipantCard } from "./ParticipantCard";

interface SplitDetailSheetProps {
  splitId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  ACTIVE: { label: "Ativo", variant: "default" },
  CLOSED: { label: "Encerrado", variant: "outline" },
};

export function SplitDetailSheet({ splitId, open, onOpenChange, onUpdated }: SplitDetailSheetProps) {
  const { isAdmin, currentHousehold } = useHousehold();
  const { toast } = useToast();
  
  const [split, setSplit] = useState<SplitEvent | null>(null);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const loadData = async () => {
    if (!splitId) return;
    
    setIsLoading(true);
    try {
      const [splitData, participantsData] = await Promise.all([
        getSplitEvent(splitId),
        getSplitParticipants(splitId),
      ]);
      
      setSplit(splitData);
      setParticipants(participantsData);
    } catch (error) {
      console.error("Error loading split:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os detalhes do rateio",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && splitId) {
      loadData();
    }
  }, [open, splitId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: split?.currency || "BRL",
    }).format(value);
  };

  const allocatedShares = participants.reduce((sum, p) => sum + p.shares, 0);
  const totalPaid = participants.reduce((sum, p) => sum + p.paid_amount, 0);
  const sharesProgress = split ? (allocatedShares / split.total_shares) * 100 : 0;
  const paymentProgress = split ? (totalPaid / split.total_amount) * 100 : 0;
  const canActivate = split && allocatedShares === split.total_shares;
  const isOwnerHousehold = split?.owner_household_id === currentHousehold?.id;

  const handleStatusChange = async (newStatus: "ACTIVE" | "CLOSED") => {
    if (!split) return;
    
    if (newStatus === "ACTIVE" && !canActivate) {
      toast({
        title: "Não é possível ativar",
        description: `Aloque todas as ${split.total_shares} cotas antes de ativar.`,
        variant: "destructive",
      });
      return;
    }
    
    setIsUpdating(true);
    try {
      await updateSplitEvent(split.id, { status: newStatus });
      toast({
        title: "Status atualizado!",
        description: newStatus === "ACTIVE" ? "Rateio ativado com sucesso." : "Rateio encerrado.",
      });
      loadData();
      onUpdated();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar o status",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!split) return;
    
    setIsUpdating(true);
    try {
      await deleteSplitEvent(split.id);
      toast({
        title: "Rateio excluído",
        description: "O rateio foi removido permanentemente.",
      });
      onOpenChange(false);
      onUpdated();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir o rateio",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleParticipantUpdated = () => {
    loadData();
    onUpdated();
  };

  if (!open) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : split ? (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <SheetTitle className="text-left">{split.title}</SheetTitle>
                    {split.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {split.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusLabels[split.status].variant}>
                    {statusLabels[split.status].label}
                  </Badge>
                </div>
              </SheetHeader>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                  <p className="text-lg font-bold">{formatCurrency(split.total_amount)}</p>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Valor por Cota</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(split.total_amount / split.total_shares)}
                  </p>
                </div>
              </div>

              {/* Shares Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    Cotas alocadas
                  </span>
                  <span className="font-medium">
                    {allocatedShares} / {split.total_shares}
                  </span>
                </div>
                <Progress value={sharesProgress} className="h-2" />
              </div>

              {/* Payment Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Total pago
                  </span>
                  <span className="font-medium">
                    {formatCurrency(totalPaid)} / {formatCurrency(split.total_amount)}
                  </span>
                </div>
                <Progress value={paymentProgress} className="h-2" />
              </div>

              <Separator />

              {/* Participants Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Participantes</h3>
                  {isAdmin && isOwnerHousehold && split.status === "DRAFT" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddParticipantOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Adicionar
                    </Button>
                  )}
                </div>

                {participants.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum participante adicionado</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {participants.map((participant) => (
                      <ParticipantCard
                        key={participant.id}
                        participant={participant}
                        totalShares={split.total_shares}
                        currency={split.currency}
                        canEdit={isAdmin && isOwnerHousehold}
                        canMarkPaid={split.status === "ACTIVE" && isAdmin && isOwnerHousehold}
                        onUpdated={handleParticipantUpdated}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              {isAdmin && isOwnerHousehold && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    {split.status === "DRAFT" && (
                      <Button
                        className="w-full"
                        onClick={() => handleStatusChange("ACTIVE")}
                        disabled={isUpdating || !canActivate}
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <PlayCircle className="w-4 h-4 mr-2" />
                        )}
                        Ativar Rateio
                      </Button>
                    )}
                    
                    {split.status === "ACTIVE" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleStatusChange("CLOSED")}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <StopCircle className="w-4 h-4 mr-2" />
                        )}
                        Encerrar Rateio
                      </Button>
                    )}

                    {split.status === "DRAFT" && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={isUpdating}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir Rateio
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p>Rateio não encontrado</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Participant Sheet */}
      {split && (
        <AddParticipantSheet
          open={addParticipantOpen}
          onOpenChange={setAddParticipantOpen}
          splitEvent={split}
          existingParticipantIds={participants.map(p => p.participant_household_id)}
          onAdded={handleParticipantUpdated}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rateio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os participantes serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
