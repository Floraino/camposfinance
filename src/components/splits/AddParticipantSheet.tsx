import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addSplitParticipant, type SplitEvent } from "@/services/splitService";
import { supabase } from "@/integrations/supabase/client";

interface AddParticipantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splitEvent: SplitEvent;
  existingParticipantIds: string[];
  onAdded: () => void;
}

interface Household {
  id: string;
  name: string;
}

export function AddParticipantSheet({
  open,
  onOpenChange,
  splitEvent,
  existingParticipantIds,
  onAdded,
}: AddParticipantSheetProps) {
  const { toast } = useToast();
  
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState("");
  const [shares, setShares] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHouseholds, setIsLoadingHouseholds] = useState(true);

  useEffect(() => {
    const loadHouseholds = async () => {
      setIsLoadingHouseholds(true);
      try {
        // Get all households (for now, we'll get what the user can see)
        // In a real scenario, you might want to allow searching or inviting
        const { data, error } = await supabase
          .from("households")
          .select("id, name")
          .order("name");

        if (error) throw error;

        // Filter out already added households
        const available = (data || []).filter(
          (h) => !existingParticipantIds.includes(h.id)
        );
        setHouseholds(available);
      } catch (error) {
        console.error("Error loading households:", error);
      } finally {
        setIsLoadingHouseholds(false);
      }
    };

    if (open) {
      loadHouseholds();
    }
  }, [open, existingParticipantIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedHouseholdId) {
      toast({
        title: "Erro",
        description: "Selecione uma família",
        variant: "destructive",
      });
      return;
    }

    const sharesNum = parseInt(shares);
    if (isNaN(sharesNum) || sharesNum < 1) {
      toast({
        title: "Erro",
        description: "Informe um número de cotas válido",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await addSplitParticipant({
        split_event_id: splitEvent.id,
        participant_household_id: selectedHouseholdId,
        shares: sharesNum,
      });

      toast({
        title: "Participante adicionado!",
        description: "A família foi adicionada ao rateio.",
      });

      setSelectedHouseholdId("");
      setShares("1");
      onOpenChange(false);
      onAdded();
    } catch (error: any) {
      console.error("Error adding participant:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível adicionar o participante",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedHousehold = households.find((h) => h.id === selectedHouseholdId);
  const sharesNum = parseInt(shares) || 0;
  const calculatedAmount = (splitEvent.total_amount * sharesNum) / splitEvent.total_shares;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[60vh]">
        <SheetHeader>
          <SheetTitle>Adicionar Participante</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="household">Família *</Label>
            {isLoadingHouseholds ? (
              <div className="flex items-center justify-center h-10 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : households.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                Nenhuma família disponível para adicionar.
              </p>
            ) : (
              <Select value={selectedHouseholdId} onValueChange={setSelectedHouseholdId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma família" />
                </SelectTrigger>
                <SelectContent>
                  {households.map((household) => (
                    <SelectItem key={household.id} value={household.id}>
                      {household.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shares">Número de Cotas *</Label>
            <Input
              id="shares"
              type="number"
              min="1"
              max={splitEvent.total_shares}
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Máximo: {splitEvent.total_shares} cotas
            </p>
          </div>

          {selectedHousehold && sharesNum > 0 && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm">
                <strong>{selectedHousehold.name}</strong> pagará{" "}
                <strong>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: splitEvent.currency,
                  }).format(calculatedAmount)}
                </strong>{" "}
                ({sharesNum}/{splitEvent.total_shares} cotas)
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || households.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adicionando...
              </>
            ) : (
              "Adicionar Participante"
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
