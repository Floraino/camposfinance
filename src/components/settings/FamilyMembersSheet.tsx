import { useState, useEffect } from "react";
import { X, Plus, Trash2, Loader2, User, Crown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { InviteCodeSheet } from "@/components/household/InviteCodeSheet";

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
  const { isAdmin } = useHousehold();
  const { toast } = useToast();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");

  useEffect(() => {
    if (open && user) {
      loadMembers();
    }
  }, [open, user]);

  const loadMembers = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("household_owner_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error("Error loading family members:", error);
      toast({
        title: "Erro ao carregar membros",
        description: "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!user || !newMemberName.trim()) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("family_members")
        .insert({
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
      loadMembers();
    } catch (error) {
      console.error("Error adding member:", error);
      toast({
        title: "Erro ao adicionar",
        description: "Não foi possível adicionar o membro",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("family_members")
        .delete()
        .eq("id", memberId)
        .eq("household_owner_id", user.id);

      if (error) throw error;

      toast({
        title: "Membro removido",
        description: `${memberName} foi removido da família.`,
      });

      loadMembers();
    } catch (error) {
      console.error("Error removing member:", error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover o membro",
        variant: "destructive",
      });
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
          <h2 className="text-xl font-bold text-foreground">Membros da Casa</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe">
          {/* Owner (current user) */}
          <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-xl border border-primary/20">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground">{profile?.display_name || "Você"}</p>
                <Crown className="w-4 h-4 text-accent" />
              </div>
              <p className="text-sm text-muted-foreground">Administrador</p>
            </div>
          </div>

          {/* Family Members */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-2">Nenhum membro adicionado ainda</p>
              <p className="text-sm text-muted-foreground">Adicione membros da família para compartilhar o controle de gastos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{member.name}</p>
                    {member.email && (
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveMember(member.id, member.name)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add Member Form */}
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
                  onClick={handleAddMember}
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

      {/* Invite Code Sheet */}
      <InviteCodeSheet 
        open={showInviteSheet} 
        onClose={() => setShowInviteSheet(false)} 
      />
    </div>
  );
}
