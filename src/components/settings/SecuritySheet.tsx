import { useState } from "react";
import { X, Shield, Lock, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SecuritySheetProps {
  open: boolean;
  onClose: () => void;
}

export function SecuritySheet({ open, onClose }: SecuritySheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Senhas não coincidem",
        description: "A nova senha e a confirmação devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setIsChanging(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: "Senha alterada!",
        description: "Sua senha foi atualizada com sucesso.",
      });

      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Erro ao alterar senha",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsChanging(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Segurança</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
          {/* Security Status */}
          <div className="p-4 bg-success/10 rounded-xl border border-success/20">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-success" />
              <span className="font-medium text-foreground">Backup Ativado</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Seus dados são automaticamente salvos e protegidos na nuvem.
            </p>
          </div>

          {/* Account Info */}
          <div className="p-4 bg-muted/30 rounded-xl space-y-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">Informações da Conta</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="text-foreground">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Última atualização</span>
                <span className="text-foreground">
                  {user?.updated_at 
                    ? new Date(user.updated_at).toLocaleDateString("pt-BR")
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Autenticação</span>
                <span className="text-success">Email verificado</span>
              </div>
            </div>
          </div>

          {/* Change Password */}
          {showChangePassword ? (
            <div className="p-4 bg-muted/20 rounded-xl border border-border space-y-4">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">Alterar Senha</span>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mobile-input pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Confirmar nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mobile-input"
                />

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setShowChangePassword(false);
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="accent" 
                    className="flex-1"
                    onClick={handleChangePassword}
                    disabled={isChanging || !newPassword || !confirmPassword}
                  >
                    {isChanging ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Salvar"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => setShowChangePassword(true)}
            >
              <Lock className="w-4 h-4 mr-3" />
              Alterar Senha
            </Button>
          )}

          {/* Security Tips */}
          <div className="p-4 bg-primary/5 rounded-xl">
            <p className="font-medium text-foreground mb-2">Dicas de Segurança</p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>• Use uma senha única com pelo menos 8 caracteres</li>
              <li>• Inclua letras, números e símbolos</li>
              <li>• Nunca compartilhe sua senha com outras pessoas</li>
              <li>• Ative a verificação em duas etapas quando disponível</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
