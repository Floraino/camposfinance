import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addSplitParticipant, type SplitEvent } from "@/services/splitService";
import {
  getHouseholdMembersWithProfiles,
  type HouseholdRole,
} from "@/services/householdService";

interface AddParticipantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splitEvent: SplitEvent;
  existingParticipantUserIds: string[];
  onAdded: () => void;
}

interface MemberOption {
  user_id: string;
  display_name: string;
  email: string | null;
  role: HouseholdRole;
}

export function AddParticipantSheet({
  open,
  onOpenChange,
  splitEvent,
  existingParticipantUserIds,
  onAdded,
}: AddParticipantSheetProps) {
  const { toast } = useToast();

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [sharesPerMember, setSharesPerMember] = useState("1");
  const [equalSplit, setEqualSplit] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  useEffect(() => {
    const loadMembers = async () => {
      setIsLoadingMembers(true);
      try {
        const all = await getHouseholdMembersWithProfiles(
          splitEvent.owner_household_id
        );
        // Filter out members already added as participants
        const available = all.filter(
          (m) => !existingParticipantUserIds.includes(m.user_id)
        );
        setMembers(available);
      } catch (error) {
        console.error("Error loading members:", error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os membros da família.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingMembers(false);
      }
    };

    if (open) {
      loadMembers();
      setSelectedUserIds(new Set());
      setSharesPerMember("1");
      setEqualSplit(true);
    }
  }, [open, existingParticipantUserIds, splitEvent.owner_household_id]);

  const toggleMember = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedUserIds.size === members.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(members.map((m) => m.user_id)));
    }
  };

  // Calculate amounts with deterministic cent distribution
  const splitAmounts = useMemo(() => {
    const n = selectedUserIds.size;
    if (n === 0) return [];

    if (equalSplit) {
      // Split total equally among selected members
      const totalCents = Math.round(splitEvent.total_amount * 100);
      const perHead = Math.floor(totalCents / n);
      const remainder = totalCents % n;

      const selectedArr = Array.from(selectedUserIds);
      return selectedArr.map((uid, idx) => ({
        userId: uid,
        amount: (perHead + (idx < remainder ? 1 : 0)) / 100,
        shares: parseInt(sharesPerMember) || 1,
      }));
    } else {
      // Each member gets the specified number of shares
      const shares = parseInt(sharesPerMember) || 1;
      const amountPerShare =
        splitEvent.total_amount / splitEvent.total_shares;

      return Array.from(selectedUserIds).map((uid) => ({
        userId: uid,
        amount: amountPerShare * shares,
        shares,
      }));
    }
  }, [selectedUserIds, splitEvent, sharesPerMember, equalSplit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedUserIds.size === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos um membro.",
        variant: "destructive",
      });
      return;
    }

    const shares = parseInt(sharesPerMember) || 1;
    if (shares < 1) {
      toast({
        title: "Erro",
        description: "O número de cotas deve ser pelo menos 1.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Add each selected member as a participant
      const promises = Array.from(selectedUserIds).map((userId) =>
        addSplitParticipant({
          split_event_id: splitEvent.id,
          participant_household_id: splitEvent.owner_household_id,
          participant_user_id: userId,
          shares,
        })
      );
      await Promise.all(promises);

      toast({
        title: `${selectedUserIds.size} membro${selectedUserIds.size > 1 ? "s" : ""} adicionado${selectedUserIds.size > 1 ? "s" : ""}!`,
        description: "Os membros foram adicionados ao rateio.",
      });

      setSelectedUserIds(new Set());
      setSharesPerMember("1");
      onOpenChange(false);
      onAdded();
    } catch (error: any) {
      console.error("Error adding participants:", error);
      toast({
        title: "Erro",
        description:
          error.message || "Não foi possível adicionar os participantes.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: splitEvent.currency || "BRL",
    }).format(value);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Adicionar Participantes</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Members List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Membros da Família *</Label>
              {members.length > 0 && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  {selectedUserIds.size === members.length
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </button>
              )}
            </div>

            {isLoadingMembers ? (
              <div className="flex items-center justify-center h-20 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground bg-muted rounded-md">
                <Users className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  Todos os membros já foram adicionados ao rateio.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {members.map((m) => (
                  <label
                    key={m.user_id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUserIds.has(m.user_id)
                        ? "bg-primary/10 border border-primary/20"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={selectedUserIds.has(m.user_id)}
                      onCheckedChange={() => toggleMember(m.user_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.display_name}
                      </p>
                      {m.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {m.email}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Shares */}
          {!equalSplit && (
            <div className="space-y-2">
              <Label htmlFor="shares">Cotas por Membro</Label>
              <Input
                id="shares"
                type="number"
                min="1"
                max={splitEvent.total_shares}
                value={sharesPerMember}
                onChange={(e) => setSharesPerMember(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Total de cotas do rateio: {splitEvent.total_shares}
              </p>
            </div>
          )}

          {/* Equal split toggle */}
          <label className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer">
            <Checkbox
              checked={equalSplit}
              onCheckedChange={(checked) => setEqualSplit(!!checked)}
            />
            <div>
              <p className="text-sm font-medium">Ratear igualmente</p>
              <p className="text-xs text-muted-foreground">
                Divide o valor total igualmente entre os membros selecionados
              </p>
            </div>
          </label>

          {/* Preview */}
          {splitAmounts.length > 0 && (
            <div className="bg-muted p-3 rounded-lg space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Prévia do rateio
              </p>
              {splitAmounts.map((sa) => {
                const m = members.find((m) => m.user_id === sa.userId);
                return (
                  <div
                    key={sa.userId}
                    className="flex justify-between text-sm"
                  >
                    <span className="truncate">{m?.display_name}</span>
                    <span className="font-semibold shrink-0 ml-2">
                      {formatCurrency(sa.amount)}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between text-sm font-bold border-t pt-1.5 mt-1.5">
                <span>Total</span>
                <span>
                  {formatCurrency(
                    splitAmounts.reduce((sum, sa) => sum + sa.amount, 0)
                  )}
                </span>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || members.length === 0 || selectedUserIds.size === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adicionando...
              </>
            ) : (
              `Adicionar ${selectedUserIds.size} Membro${selectedUserIds.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
