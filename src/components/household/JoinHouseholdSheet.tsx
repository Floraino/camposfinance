import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHousehold } from "@/hooks/useHousehold";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const codeSchema = z.string()
  .trim()
  .min(8, "O código deve ter 8 caracteres")
  .max(8, "O código deve ter 8 caracteres")
  .regex(/^[A-Za-z0-9]+$/, "O código só pode conter letras e números");

interface JoinHouseholdSheetProps {
  open: boolean;
  onClose: () => void;
}

export function JoinHouseholdSheet({ open, onClose }: JoinHouseholdSheetProps) {
  const [code, setCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshHouseholds, switchHousehold } = useHousehold();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCodeChange = (value: string) => {
    // Only allow alphanumeric characters and limit to 8
    const cleanValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    setCode(cleanValue);
    setError(null);
  };

  const handleJoin = async () => {
    // Validate input
    const validation = codeSchema.safeParse(code);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("join_household_by_code", {
        _code: code,
      });

      if (rpcError) throw rpcError;

      const result = data as { 
        success: boolean; 
        error?: string; 
        pending?: boolean;
        household_id?: string; 
        household_name?: string;
        message?: string;
      };

      if (!result.success) {
        setError(result.error || "Erro ao entrar na família");
        return;
      }

      // Check if request is pending approval
      if (result.pending) {
        toast({
          title: "Solicitação enviada!",
          description: `Aguarde a aprovação do administrador de "${result.household_name}"`,
        });
        onClose();
        setCode("");
        return;
      }

      toast({
        title: "Você entrou na família!",
        description: `Bem-vindo à "${result.household_name}"`,
      });

      // Refresh households list
      await refreshHouseholds();
      
      // Get the household and switch to it
      const { data: households } = await supabase
        .from("households")
        .select("*")
        .eq("id", result.household_id)
        .single();

      if (households) {
        switchHousehold(households);
        navigate("/");
      }

      onClose();
      setCode("");
    } catch (err) {
      console.error("Error joining household:", err);
      setError("Erro ao processar o código. Tente novamente.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setError(null);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-accent" />
            </div>
            <div>
              <SheetTitle>Entrar em uma Família</SheetTitle>
              <p className="text-sm text-muted-foreground">
                Digite o código de convite
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4">
          {/* Code Input */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Código de Convite
            </label>
            <input
              type="text"
              placeholder="Ex: ABC12345"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className={`mobile-input text-center text-2xl font-mono tracking-widest uppercase ${
                error ? "border-destructive" : ""
              }`}
              maxLength={8}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Peça o código para o dono da família
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={handleClose}
              disabled={isJoining}
            >
              Cancelar
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onClick={handleJoin}
              disabled={isJoining || code.length !== 8}
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
