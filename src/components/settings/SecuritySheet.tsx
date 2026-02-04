import { useState, useEffect } from "react";
import { X, Shield, Lock, Eye, EyeOff, Loader2, CheckCircle, Clock, LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { updatePassword, getAuthEvents } from "@/services/secureAuthService";
import { validatePassword, getPasswordStrength } from "@/lib/authValidation";

interface SecuritySheetProps {
  open: boolean;
  onClose: () => void;
}

interface AuthEvent {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function SecuritySheet({ open, onClose }: SecuritySheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [authEvents, setAuthEvents] = useState<AuthEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    if (open) {
      loadAuthEvents();
    }
  }, [open]);

  const loadAuthEvents = async () => {
    setLoadingEvents(true);
    try {
      const events = await getAuthEvents(10);
      setAuthEvents(events);
    } finally {
      setLoadingEvents(false);
    }
  };

  const passwordErrors = validatePassword(newPassword);
  const passwordStrength = getPasswordStrength(newPassword);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Senhas não coincidem",
        description: "A nova senha e a confirmação devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    if (passwordErrors.length > 0) {
      toast({
        title: "Senha inválida",
        description: passwordErrors[0],
        variant: "destructive",
      });
      return;
    }

    setIsChanging(true);

    try {
      const result = await updatePassword(newPassword);

      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Senha alterada!",
        description: "Sua senha foi atualizada com sucesso.",
      });

      setShowChangePassword(false);
      setNewPassword("");
      setConfirmPassword("");
      loadAuthEvents(); // Refresh events
    } catch (error: any) {
      toast({
        title: "Erro ao alterar senha",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsChanging(false);
    }
  };

  const formatEventType = (type: string): { label: string; color: string; icon: typeof CheckCircle } => {
    const types: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
      login_success: { label: "Login bem-sucedido", color: "text-success", icon: CheckCircle },
      login_failed: { label: "Tentativa de login", color: "text-destructive", icon: AlertTriangle },
      logout: { label: "Logout", color: "text-muted-foreground", icon: LogOut },
      password_reset_requested: { label: "Recuperação de senha", color: "text-warning", icon: Lock },
      password_reset_completed: { label: "Senha alterada", color: "text-success", icon: Lock },
      password_changed: { label: "Senha alterada", color: "text-success", icon: Lock },
      session_revoked: { label: "Sessão encerrada", color: "text-warning", icon: LogOut },
      account_locked: { label: "Conta bloqueada", color: "text-destructive", icon: AlertTriangle },
    };
    return types[type] || { label: type, color: "text-muted-foreground", icon: Clock };
  };

  const formatUserAgent = (ua: string | null): string => {
    if (!ua) return "Desconhecido";
    if (ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone")) {
      return "Celular";
    }
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "Mac";
    if (ua.includes("Linux")) return "Linux";
    return "Navegador";
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
              <span className="font-medium text-foreground">Proteção Ativa</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Sua conta está protegida com rate limiting e sessões seguras.
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
                <span className="text-muted-foreground">Email verificado</span>
                <span className={user?.email_confirmed_at ? "text-success" : "text-warning"}>
                  {user?.email_confirmed_at ? "Sim" : "Pendente"}
                </span>
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

                {/* Password Requirements */}
                {newPassword && (
                  <div className="space-y-1 text-xs">
                    <div className={`flex items-center gap-2 ${newPassword.length >= 8 ? "text-success" : "text-muted-foreground"}`}>
                      {newPassword.length >= 8 ? "✓" : "○"} Mínimo 8 caracteres
                    </div>
                    <div className={`flex items-center gap-2 ${/[a-zA-Z]/.test(newPassword) ? "text-success" : "text-muted-foreground"}`}>
                      {/[a-zA-Z]/.test(newPassword) ? "✓" : "○"} Pelo menos uma letra
                    </div>
                    <div className={`flex items-center gap-2 ${/[0-9]/.test(newPassword) ? "text-success" : "text-muted-foreground"}`}>
                      {/[0-9]/.test(newPassword) ? "✓" : "○"} Pelo menos um número
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            passwordStrength.color === "destructive" ? "bg-destructive" :
                            passwordStrength.color === "warning" ? "bg-warning" :
                            passwordStrength.color === "primary" ? "bg-primary" :
                            "bg-success"
                          }`}
                          style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs">{passwordStrength.label}</span>
                    </div>
                  </div>
                )}

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
                    disabled={isChanging || !newPassword || !confirmPassword || passwordErrors.length > 0}
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

          {/* Recent Activity */}
          <div className="p-4 bg-muted/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">Atividade Recente</span>
              </div>
              {loadingEvents && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            
            {authEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {authEvents.map((event) => {
                  const { label, color, icon: Icon } = formatEventType(event.event_type);
                  return (
                    <div key={event.id} className="flex items-center gap-3 text-sm py-2 border-b border-border/50 last:border-0">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${color}`}>{label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatUserAgent(event.user_agent)} • {event.ip_address || "IP desconhecido"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Security Tips */}
          <div className="p-4 bg-primary/5 rounded-xl">
            <p className="font-medium text-foreground mb-2">Dicas de Segurança</p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>• Use uma senha única com pelo menos 8 caracteres</li>
              <li>• Inclua letras, números e símbolos</li>
              <li>• Nunca compartilhe sua senha com outras pessoas</li>
              <li>• Fique atento a emails de phishing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
