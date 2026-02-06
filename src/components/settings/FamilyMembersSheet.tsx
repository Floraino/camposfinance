import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  User,
  Crown,
  UserPlus,
  Clock,
  ShieldCheck,
  ShieldOff,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { InviteCodeSheet } from "@/components/household/InviteCodeSheet";
import { PendingRequestsSheet } from "@/components/household/PendingRequestsSheet";
import {
  getHouseholdMembersWithProfiles,
  removeHouseholdMember,
  updateMemberRole,
  type HouseholdMember,
  type HouseholdRole,
} from "@/services/householdService";

// A household member enriched with profile data
interface HouseholdMemberWithProfile extends HouseholdMember {
  display_name: string;
  email: string | null;
}

// Manual (non-auth) family member from the family_members table
interface FamilyMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar_url: string | null;
}

interface FamilyMembersSheetProps {
  open: boolean;
  onClose: () => void;
}

export function FamilyMembersSheet({ open, onClose }: FamilyMembersSheetProps) {
  const { user, profile } = useAuth();
  const { isAdmin, currentHousehold } = useHousehold();
  const { toast } = useToast();

  // Authenticated household members
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberWithProfile[]>([]);
  const [isLoadingHousehold, setIsLoadingHousehold] = useState(true);

  // Manual family members (legacy table)
  const [manualMembers, setManualMembers] = useState<FamilyMember[]>([]);
  const [isLoadingManual, setIsLoadingManual] = useState(true);

  // Action states
  const [isRoleUpdating, setIsRoleUpdating] = useState<string | null>(null);
  const [expelTarget, setExpelTarget] = useState<HouseholdMemberWithProfile | null>(null);
  const [isExpelling, setIsExpelling] = useState(false);

  // Add manual member
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");

  // Invite / requests
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (open && user) {
      loadHouseholdMembers();
      loadManualMembers();
    }
  }, [open, user, currentHousehold?.id]);

  useEffect(() => {
    if (open && isAdmin && currentHousehold) {
      loadPendingCount();
    }
  }, [open, isAdmin, currentHousehold]);

  // ─── Load authenticated household members ─────────────────────
  const loadHouseholdMembers = async () => {
    if (!currentHousehold?.id) {
      setHouseholdMembers([]);
      setIsLoadingHousehold(false);
      return;
    }
    setIsLoadingHousehold(true);
    try {
      const list = await getHouseholdMembersWithProfiles(currentHousehold.id);
      setHouseholdMembers(list);
    } catch (err: any) {
      console.error("Error loading household members:", err);
      toast({
        title: "Erro ao carregar membros",
        description: err.message || "Não foi possível listar os membros da família.",
        variant: "destructive",
      });
      setHouseholdMembers([]);
    } finally {
      setIsLoadingHousehold(false);
    }
  };

  // ─── Load manual (non-auth) members ───────────────────────────
  const loadManualMembers = async () => {
    if (!user) return;
    setIsLoadingManual(true);
    try {
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("household_owner_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setManualMembers(data || []);
    } catch (err) {
      console.error("Error loading manual members:", err);
    } finally {
      setIsLoadingManual(false);
    }
  };

  // ─── Pending requests count ───────────────────────────────────
  const loadPendingCount = async () => {
    if (!currentHousehold) return;
    try {
      const { count, error } = await supabase
        .from("household_join_requests")
        .select("*", { count: "exact", head: true })
        .eq("household_id", currentHousehold.id)
        .eq("status", "pending");

      if (!error && count !== null) {
        setPendingCount(count);
      }
    } catch (err) {
      console.error("Error loading pending count:", err);
    }
  };

  // ─── Role change (promote / demote) ───────────────────────────
  const handleRoleChange = async (targetUserId: string, newRole: HouseholdRole) => {
    if (!currentHousehold?.id) return;
    setIsRoleUpdating(targetUserId);
    try {
      await updateMemberRole(currentHousehold.id, targetUserId, newRole);
      toast({
        title: newRole === "member" ? "Rebaixado para membro" : "Promovido para admin",
        description: "O cargo foi atualizado com sucesso.",
      });
      await loadHouseholdMembers();
    } catch (error: any) {
      toast({
        title: "Erro ao alterar cargo",
        description: error.message || "Não foi possível alterar o cargo",
        variant: "destructive",
      });
    } finally {
      setIsRoleUpdating(null);
    }
  };

  // ─── Expel household member ───────────────────────────────────
  const handleExpelMember = async () => {
    if (!currentHousehold?.id || !expelTarget) return;
    setIsExpelling(true);
    try {
      await removeHouseholdMember(currentHousehold.id, expelTarget.user_id);
      toast({
        title: "Membro removido",
        description: `${expelTarget.display_name} foi removido da família.`,
      });
      setExpelTarget(null);
      await loadHouseholdMembers();
    } catch (error: any) {
      toast({
        title: "Erro ao remover membro",
        description: error.message || "Não foi possível remover o membro",
        variant: "destructive",
      });
    } finally {
      setIsExpelling(false);
    }
  };

  // ─── Add manual member ────────────────────────────────────────
  const handleAddManualMember = async () => {
    if (!user || !newMemberName.trim()) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("family_members").insert({
        household_owner_id: user.id,
        name: newMemberName.trim(),
        email: newMemberEmail.trim() || null,
        role: "member",
      });
      if (error) throw error;
      toast({
        title: "Membro adicionado!",
        description: `${newMemberName} foi adicionado à família.`,
      });
      setNewMemberName("");
      setNewMemberEmail("");
      setShowAddForm(false);
      loadManualMembers();
    } catch (err: any) {
      toast({
        title: "Erro ao adicionar",
        description: err.message || "Não foi possível adicionar o membro",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Remove manual member ─────────────────────────────────────
  const handleRemoveManualMember = async (memberId: string, memberName: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("family_members")
        .delete()
        .eq("id", memberId)
        .eq("household_owner_id", user.id);
      if (error) throw error;
      toast({ title: "Membro removido", description: `${memberName} foi removido.` });
      loadManualMembers();
    } catch (err: any) {
      toast({
        title: "Erro ao remover",
        description: err.message || "Não foi possível remover o membro",
        variant: "destructive",
      });
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────
  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner": return "Dono";
      case "admin": return "Admin";
      default: return "Membro";
    }
  };

  const isLoading = isLoadingHousehold;

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
          <h2 className="text-xl font-bold text-foreground">Membros da Casa</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
          {/* ── Authenticated Household Members ── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : householdMembers.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm">
                Nenhum membro encontrado nesta família.
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Convide pessoas usando o código de convite abaixo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Membros da Família ({householdMembers.length})
              </h3>
              {householdMembers.map((hm) => {
                const isCurrentUser = hm.user_id === user?.id;
                const isOwnerRole = hm.role === "owner";
                const isAdminRole = hm.role === "admin";
                const canChangeRole = isAdmin && !isCurrentUser && !isOwnerRole;
                const canExpel = isAdmin && !isCurrentUser;

                return (
                  <div
                    key={hm.id}
                    className={`flex items-center gap-3 p-4 rounded-xl ${
                      isCurrentUser
                        ? "bg-primary/10 border border-primary/20"
                        : "bg-muted/30"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        isCurrentUser ? "bg-primary/20" : "bg-muted"
                      }`}
                    >
                      {isCurrentUser && profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="Avatar"
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <User
                          className={`w-6 h-6 ${
                            isCurrentUser ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                      )}
                    </div>

                    {/* Info: nome do perfil + cargo na família */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">
                          {hm.display_name || (isCurrentUser ? "Você" : "Sem nome")}
                        </p>
                        {isOwnerRole && (
                          <Crown className="w-4 h-4 text-accent shrink-0" />
                        )}
                        {isAdminRole && (
                          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {getRoleLabel(hm.role)}
                        {isCurrentUser && " (você)"}
                      </p>
                    </div>

                    {/* Actions — only for admins, never for self or owner */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Promote / Demote */}
                      {canChangeRole && (
                        <>
                          {hm.role === "member" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isRoleUpdating === hm.user_id}
                              onClick={() => handleRoleChange(hm.user_id, "admin")}
                              className="text-primary text-xs gap-1"
                              title="Promover para admin"
                            >
                              {isRoleUpdating === hm.user_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                              Promover
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isRoleUpdating === hm.user_id}
                              onClick={() => handleRoleChange(hm.user_id, "member")}
                              className="text-orange-500 text-xs gap-1"
                              title="Rebaixar para membro"
                            >
                              {isRoleUpdating === hm.user_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldOff className="w-3.5 h-3.5" />
                              )}
                              Rebaixar
                            </Button>
                          )}
                        </>
                      )}
                      {/* Expel */}
                      {canExpel && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setExpelTarget(hm)}
                          title="Expulsar membro"
                        >
                          <LogOut className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Manual Family Members (non-auth) ── */}
          {manualMembers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                Membros Manuais
              </h3>
              {manualMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl"
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {member.name}
                    </p>
                    {member.email && (
                      <p className="text-sm text-muted-foreground truncate">
                        {member.email}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      handleRemoveManualMember(member.id, member.name)
                    }
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* ── Add Member Form ── */}
          {showAddForm ? (
            <div className="space-y-4 p-4 bg-muted/20 rounded-xl border border-border">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Nome *
                </label>
                <input
                  type="text"
                  placeholder="Nome do membro"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="mobile-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Email (opcional)
                </label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="mobile-input"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewMemberName("");
                    setNewMemberEmail("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="accent"
                  className="flex-1"
                  onClick={handleAddManualMember}
                  disabled={isSaving || !newMemberName.trim()}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Adicionar"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Invite via code button (admin only) */}
              {isAdmin && (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => setShowInviteSheet(true)}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convidar via Código
                </Button>
              )}

              {/* Pending Requests Button (admin only) */}
              {isAdmin && pendingCount > 0 && (
                <Button
                  variant="default"
                  className="w-full relative"
                  onClick={() => setShowPendingRequests(true)}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Solicitações Pendentes
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                </Button>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Membro Manual
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Expulsion Confirmation Dialog ── */}
      <AlertDialog
        open={!!expelTarget}
        onOpenChange={(open) => {
          if (!open) setExpelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Expulsar membro?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{expelTarget?.display_name}</strong> será removido da
              família e perderá acesso a todos os dados compartilhados. Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExpelling}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExpelMember}
              disabled={isExpelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isExpelling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Expulsar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Code Sheet */}
      <InviteCodeSheet
        open={showInviteSheet}
        onClose={() => setShowInviteSheet(false)}
      />

      {/* Pending Requests Sheet */}
      <PendingRequestsSheet
        open={showPendingRequests}
        onClose={() => {
          setShowPendingRequests(false);
          loadPendingCount();
        }}
      />
    </div>
  );
}
