import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  getAdminUsers, 
  setUserBlocked, 
  setUserRole, 
  deleteUserProfile,
  updateUserDisplayName,
  AdminUser 
} from "@/services/adminService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { 
  ArrowLeft, Search, User, Shield, Ban,
  Loader2, Home, Trash2, Pencil
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showConfirmAdmin, setShowConfirmAdmin] = useState(false);
  const [showConfirmBlock, setShowConfirmBlock] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async (searchTerm?: string) => {
    setIsLoading(true);
    try {
      const data = await getAdminUsers(searchTerm);
      setUsers(data);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    loadUsers(search || undefined);
  };

  const handleToggleBlock = async () => {
    if (!selectedUser) return;
    
    setIsProcessing(true);
    try {
      await setUserBlocked(selectedUser.user_id, !selectedUser.is_blocked);
      toast({
        title: selectedUser.is_blocked ? "Usuário desbloqueado" : "Usuário bloqueado",
      });
      // Reload and update selected user
      const freshData = await getAdminUsers(search || undefined);
      setUsers(freshData);
      const updated = freshData.find(u => u.user_id === selectedUser.user_id);
      if (updated) setSelectedUser(updated);
      setShowConfirmBlock(false);
    } catch (error) {
      console.error("Error toggling block:", error);
      toast({ title: "Erro", description: "Falha ao alterar status", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleAdmin = async () => {
    if (!selectedUser) return;
    
    setIsProcessing(true);
    try {
      const newRole = selectedUser.role === "super_admin" ? "user" : "super_admin";
      await setUserRole(selectedUser.user_id, newRole);
      toast({
        title: newRole === "super_admin" ? "Admin promovido" : "Admin revogado",
      });
      // Reload and update selected user
      const freshData = await getAdminUsers(search || undefined);
      setUsers(freshData);
      const updated = freshData.find(u => u.user_id === selectedUser.user_id);
      if (updated) setSelectedUser(updated);
      setShowConfirmAdmin(false);
    } catch (error) {
      console.error("Error toggling admin:", error);
      toast({ title: "Erro", description: "Falha ao alterar role", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setIsProcessing(true);
    try {
      await deleteUserProfile(selectedUser.user_id);
      toast({ title: "Usuário excluído", description: "Perfil e dados removidos." });
      // Reload list after deletion
      const freshData = await getAdminUsers(search || undefined);
      setUsers(freshData);
      setShowConfirmDelete(false);
      setShowDetail(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ title: "Erro", description: "Falha ao excluir usuário", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateDisplayName = async () => {
    if (!selectedUser || !newDisplayName.trim()) return;
    
    setIsProcessing(true);
    try {
      await updateUserDisplayName(selectedUser.user_id, newDisplayName.trim());
      toast({ title: "Nome atualizado" });
      // Reload and update selected user
      const freshData = await getAdminUsers(search || undefined);
      setUsers(freshData);
      const updated = freshData.find(u => u.user_id === selectedUser.user_id);
      if (updated) setSelectedUser(updated);
      setShowEditName(false);
    } catch (error) {
      console.error("Error updating name:", error);
      toast({ title: "Erro", description: "Falha ao atualizar nome", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold">Usuários</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} size="icon">
            <Search className="w-4 h-4" />
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <Card
                key={user.id}
                className={`p-4 cursor-pointer hover:bg-card/80 transition-colors ${
                  user.is_blocked ? "opacity-50" : ""
                }`}
                onClick={() => {
                  setSelectedUser(user);
                  setNewDisplayName(user.display_name);
                  setShowDetail(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.display_name}</span>
                      {user.role === "super_admin" && (
                        <Shield className="w-4 h-4 text-destructive" />
                      )}
                      {user.is_blocked && (
                        <Ban className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span>{user.households_count} famílias</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {selectedUser?.display_name}
            </SheetTitle>
          </SheetHeader>

          {selectedUser && (
            <div className="space-y-4">
              {/* Info */}
              <Card className="p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Role</span>
                  <span className={`text-sm font-medium ${
                    selectedUser.role === "super_admin" ? "text-destructive" : ""
                  }`}>
                    {selectedUser.role === "super_admin" ? "Super Admin" : "Usuário"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className={`text-sm font-medium ${
                    selectedUser.is_blocked ? "text-destructive" : "text-green-500"
                  }`}>
                    {selectedUser.is_blocked ? "Bloqueado" : "Ativo"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Famílias</span>
                  <span className="text-sm flex items-center gap-1">
                    <Home className="w-4 h-4" />
                    {selectedUser.households_count}
                  </span>
                </div>
              </Card>

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowEditName(true)}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar Nome
                </Button>

                <Button
                  variant={selectedUser.is_blocked ? "accent" : "outline"}
                  className="w-full"
                  onClick={() => setShowConfirmBlock(true)}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  {selectedUser.is_blocked ? "Desbloquear Usuário" : "Bloquear Usuário"}
                </Button>

                <Button
                  variant={selectedUser.role === "super_admin" ? "outline" : "default"}
                  className="w-full"
                  onClick={() => setShowConfirmAdmin(true)}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  {selectedUser.role === "super_admin" ? "Revogar Admin" : "Promover a Admin"}
                </Button>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowConfirmDelete(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Usuário
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Name Sheet */}
      <Sheet open={showEditName} onOpenChange={setShowEditName}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Editar Nome do Usuário</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <Input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Nome de exibição"
            />

            <Button
              variant="accent"
              className="w-full"
              onClick={handleUpdateDisplayName}
              disabled={isProcessing || !newDisplayName.trim()}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm Block Dialog */}
      <AlertDialog open={showConfirmBlock} onOpenChange={setShowConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.is_blocked ? "Desbloquear usuário?" : "Bloquear usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.is_blocked
                ? "O usuário poderá acessar o app novamente."
                : "O usuário não poderá mais acessar o app."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleBlock} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Admin Dialog */}
      <AlertDialog open={showConfirmAdmin} onOpenChange={setShowConfirmAdmin}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.role === "super_admin" ? "Revogar admin?" : "Promover a admin?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.role === "super_admin"
                ? "O usuário perderá acesso ao painel administrativo."
                : "O usuário terá acesso total ao painel administrativo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleAdmin} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete Dialog */}
      <AlertDialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o perfil, preferências e roles do usuário.
              O usuário será removido de todas as famílias.
              A conta de autenticação não será excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}