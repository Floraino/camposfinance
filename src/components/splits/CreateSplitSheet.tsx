import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import { createSplitEvent } from "@/services/splitService";

interface CreateSplitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateSplitSheet({ open, onOpenChange, onCreated }: CreateSplitSheetProps) {
  const { currentHousehold } = useHousehold();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [totalShares, setTotalShares] = useState("16");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentHousehold) return;
    
    const amount = parseFloat(totalAmount.replace(/[^\d,.-]/g, "").replace(",", "."));
    const shares = parseInt(totalShares);
    
    if (!title.trim()) {
      toast({
        title: "Erro",
        description: "Informe o nome do rateio",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor total válido",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(shares) || shares <= 0) {
      toast({
        title: "Erro",
        description: "Informe um número de cotas válido",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      await createSplitEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        total_amount: amount,
        total_shares: shares,
        owner_household_id: currentHousehold.id,
      });
      
      toast({
        title: "Rateio criado!",
        description: "Agora adicione os participantes ao rateio.",
      });
      
      // Reset form
      setTitle("");
      setDescription("");
      setTotalAmount("");
      setTotalShares("16");
      
      onCreated();
    } catch (error: any) {
      console.error("Error creating split:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar o rateio",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh]">
        <SheetHeader>
          <SheetTitle>Novo Rateio</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Nome do Rateio *</Label>
            <Input
              id="title"
              placeholder="Ex: Viagem Floripa 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descreva os detalhes do rateio..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Valor Total (R$) *</Label>
              <Input
                id="totalAmount"
                type="text"
                inputMode="decimal"
                placeholder="10.000,00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalShares">Total de Cotas *</Label>
              <Input
                id="totalShares"
                type="number"
                min="1"
                placeholder="16"
                value={totalShares}
                onChange={(e) => setTotalShares(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Valor por cota:</strong>{" "}
              {(() => {
                const amount = parseFloat(totalAmount.replace(/[^\d,.-]/g, "").replace(",", "."));
                const shares = parseInt(totalShares);
                if (isNaN(amount) || isNaN(shares) || shares <= 0) return "R$ 0,00";
                return new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(amount / shares);
              })()}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Rateio"
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
