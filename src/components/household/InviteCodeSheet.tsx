import { useState, useEffect } from "react";
import { useHousehold } from "@/hooks/useHousehold";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserPlus, Copy, RefreshCw, Loader2, Share2, Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface InviteCodeSheetProps {
  open: boolean;
  onClose: () => void;
}

interface InviteCode {
  id: string;
  code: string;
  expires_at: string;
  uses_count: number | null;
  max_uses: number | null;
  is_active: boolean | null;
}

export function InviteCodeSheet({ open, onClose }: InviteCodeSheetProps) {
  const { currentHousehold, isAdmin } = useHousehold();
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && currentHousehold) {
      loadInvites();
    }
  }, [open, currentHousehold]);

  const loadInvites = async () => {
    if (!currentHousehold) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("household_invites")
        .select("*")
        .eq("household_id", currentHousehold.id)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvites(data || []);
    } catch (err) {
      console.error("Error loading invites:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const createInvite = async () => {
    if (!currentHousehold) return;
    
    setIsCreating(true);
    try {
      // Generate code using database function
      const { data: codeData, error: codeError } = await supabase.rpc("generate_invite_code");
      if (codeError) throw codeError;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("household_invites")
        .insert({
          household_id: currentHousehold.id,
          code: codeData,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setInvites([data, ...invites]);
      toast({
        title: "Código criado!",
        description: "Compartilhe com quem deseja convidar.",
      });
    } catch (err) {
      console.error("Error creating invite:", err);
      toast({
        title: "Erro ao criar código",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const deleteInvite = async (id: string) => {
    try {
      const { error } = await supabase
        .from("household_invites")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;

      setInvites(invites.filter((i) => i.id !== id));
      toast({
        title: "Código removido",
      });
    } catch (err) {
      console.error("Error deleting invite:", err);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
      toast({
        title: "Código copiado!",
        description: "Cole e envie para quem deseja convidar.",
      });
    } catch (err) {
      console.error("Error copying code:", err);
    }
  };

  const shareCode = async (code: string) => {
    const text = `Entre na minha família no CasaCampos! Use o código: ${code}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Convite CasaCampos",
          text,
        });
      } catch (err) {
        // User cancelled or error
        copyCode(code);
      }
    } else {
      copyCode(code);
    }
  };

  const formatExpiry = (date: string) => {
    const expiry = new Date(date);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days <= 0) return "Expirado";
    if (days === 1) return "Expira amanhã";
    return `Expira em ${days} dias`;
  };

  const formatUses = (usesCount: number | null, maxUses: number | null) => {
    const uses = usesCount ?? 0;
    const max = maxUses ?? 10;
    return `${uses}/${max} usos`;
  };

  if (!isAdmin) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Convidar Membros</SheetTitle>
          </SheetHeader>
          <p className="text-muted-foreground text-center py-8">
            Apenas o dono ou administrador da família pode criar códigos de convite.
          </p>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl pb-safe">
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              <SheetTitle>Códigos de Convite</SheetTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={createInvite}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Novo
                </>
              )}
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-3 overflow-y-auto max-h-[calc(70vh-140px)]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Nenhum código ativo. Crie um para convidar membros.
              </p>
              <Button variant="accent" onClick={createInvite} disabled={isCreating}>
                {isCreating ? "Criando..." : "Criar Código"}
              </Button>
            </div>
          ) : (
            invites.map((invite) => (
              <div
                key={invite.id}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-mono font-bold tracking-widest text-foreground">
                    {invite.code}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => shareCode(invite.code)}
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyCode(invite.code)}
                    >
                      {copiedCode === invite.code ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteInvite(invite.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{formatExpiry(invite.expires_at)}</span>
                  <span>{formatUses(invite.uses_count, invite.max_uses)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-4 border-t border-border mt-4">
          <p className="text-xs text-muted-foreground text-center">
            Códigos expiram em 7 dias e podem ser usados até 10 vezes
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
