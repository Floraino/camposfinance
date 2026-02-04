import { useState } from "react";
import { useHousehold } from "@/hooks/useHousehold";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ticket, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RedeemCouponSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RedeemCouponSheet({ open, onClose, onSuccess }: RedeemCouponSheetProps) {
  const { currentHousehold, isAdmin } = useHousehold();
  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<{ days_granted?: number; pro_expires_at?: string } | null>(null);
  const { toast } = useToast();

  const handleRedeem = async () => {
    if (!code.trim() || !currentHousehold) return;

    setIsRedeeming(true);
    try {
      const { data, error } = await supabase.rpc("redeem_coupon", {
        _code: code.trim(),
        _household_id: currentHousehold.id,
      });

      if (error) throw error;

      const response = data as { success: boolean; error?: string; days_granted?: number; pro_expires_at?: string };

      if (!response.success) {
        toast({
          title: "Erro",
          description: response.error || "Não foi possível resgatar o cupom",
          variant: "destructive",
        });
        return;
      }

      setSuccess(true);
      setResult(response);

      toast({
        title: "Cupom resgatado!",
        description: `${response.days_granted} dias de Pro adicionados à sua família`,
      });

      onSuccess?.();
    } catch (error) {
      console.error("Error redeeming coupon:", error);
      toast({
        title: "Erro",
        description: "Falha ao resgatar cupom. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setSuccess(false);
    setResult(null);
    onClose();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  if (!isAdmin) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Resgatar Cupom</SheetTitle>
          </SheetHeader>
          <p className="text-center text-muted-foreground py-8">
            Apenas o dono ou administrador da família pode resgatar cupons.
          </p>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Ticket className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <SheetTitle>Resgatar Cupom</SheetTitle>
              <p className="text-sm text-muted-foreground">
                Ative benefícios para sua família
              </p>
            </div>
          </div>
        </SheetHeader>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Cupom Resgatado!</h3>
              {result && (
                <p className="text-muted-foreground mt-1">
                  {result.days_granted} dias de Pro adicionados.
                  <br />
                  Pro ativo até {result.pro_expires_at && formatDate(result.pro_expires_at)}
                </p>
              )}
            </div>
            <Button variant="accent" className="w-full" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Código do Cupom
              </label>
              <Input
                placeholder="Ex: PROMO30"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="text-center text-xl font-mono tracking-widest uppercase"
                maxLength={20}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                variant="accent"
                className="flex-1"
                onClick={handleRedeem}
                disabled={isRedeeming || !code.trim()}
              >
                {isRedeeming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Resgatando...
                  </>
                ) : (
                  "Resgatar"
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
