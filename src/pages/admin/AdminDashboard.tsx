import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { getAdminStats, getAuditLogs, AdminStats, AuditLog } from "@/services/adminService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Home, Users, Crown, Ticket, Activity, 
  ChevronRight, Shield, Loader2 
} from "lucide-react";

export default function AdminDashboard() {
  const { isSuperAdmin, isLoading: adminLoading } = useAdmin();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, logsData] = await Promise.all([
        getAdminStats(),
        getAuditLogs(10),
      ]);
      setStats(statsData);
      setLogs(logsData);
    } catch (error) {
      console.error("Error loading admin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (adminLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatAction = (action: string) => {
    const actions: Record<string, string> = {
      grant_pro_days: "Concedeu dias Pro",
      change_plan: "Alterou plano",
      create_coupon: "Criou cupom",
      deactivate_coupon: "Desativou cupom",
      block_user: "Bloqueou usuário",
      unblock_user: "Desbloqueou usuário",
      promote_admin: "Promoveu admin",
      revoke_admin: "Revogou admin",
      coupon_redeemed: "Cupom resgatado",
    };
    return actions[action] || action;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="admin-header-safe bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Painel Admin</h1>
            <p className="text-xs text-muted-foreground">Área restrita</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Home className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.totalHouseholds || 0}</p>
                <p className="text-xs text-muted-foreground">Famílias</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.totalUsers || 0}</p>
                <p className="text-xs text-muted-foreground">Usuários</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.proHouseholds || 0}</p>
                <p className="text-xs text-muted-foreground">Famílias Pro</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.activeCoupons || 0}</p>
                <p className="text-xs text-muted-foreground">Cupons Ativos</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Menu Admin</h2>
          <div className="space-y-2">
            <Link to="/admin/households">
              <Card className="p-4 flex items-center justify-between hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-3">
                  <Home className="w-5 h-5 text-primary" />
                  <span className="font-medium">Famílias</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Card>
            </Link>

            <Link to="/admin/users">
              <Card className="p-4 flex items-center justify-between hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-accent" />
                  <span className="font-medium">Usuários</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Card>
            </Link>

            <Link to="/admin/coupons">
              <Card className="p-4 flex items-center justify-between hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-3">
                  <Ticket className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Cupons</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Card>
            </Link>

            <Link to="/admin/audit">
              <Card className="p-4 flex items-center justify-between hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Auditoria</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Card>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Atividade Recente</h2>
          <Card className="divide-y divide-border">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                Nenhuma atividade registrada
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {formatAction(log.action_type)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.admin_name} • {formatDate(log.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* Back button */}
        <Link to="/">
          <Button variant="outline" className="w-full">
            Voltar ao App
          </Button>
        </Link>
      </div>
    </div>
  );
}
