import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAuditLogs, AuditLog } from "@/services/adminService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, Activity, Loader2, User, Home, 
  Ticket, Crown, Ban, Shield
} from "lucide-react";

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await getAuditLogs(100);
      setLogs(data);
    } catch (error) {
      console.error("Error loading logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes("coupon")) return <Ticket className="w-4 h-4" />;
    if (action.includes("pro") || action.includes("plan")) return <Crown className="w-4 h-4" />;
    if (action.includes("block")) return <Ban className="w-4 h-4" />;
    if (action.includes("admin")) return <Shield className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getActionColor = (action: string) => {
    if (action.includes("block")) return "text-destructive";
    if (action.includes("grant") || action.includes("create")) return "text-green-500";
    if (action.includes("revoke") || action.includes("deactivate")) return "text-amber-500";
    return "text-muted-foreground";
  };

  const formatAction = (action: string) => {
    const actions: Record<string, string> = {
      grant_pro_days: "Concedeu dias Pro",
      change_plan: "Alterou plano",
      create_coupon: "Criou cupom",
      deactivate_coupon: "Desativou cupom",
      block_user: "Bloqueou usuário",
      unblock_user: "Desbloqueou usuário",
      promote_admin: "Promoveu a admin",
      revoke_admin: "Revogou admin",
      coupon_redeemed: "Cupom resgatado",
    };
    return actions[action] || action;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case "user": return <User className="w-3 h-3" />;
      case "household": return <Home className="w-3 h-3" />;
      case "coupon": return <Ticket className="w-3 h-3" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="admin-header-safe bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold">Auditoria</h1>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma ação registrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center ${getActionColor(log.action_type)}`}>
                    {getActionIcon(log.action_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{formatAction(log.action_type)}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{log.admin_name}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {getTargetIcon(log.target_type)}
                        {log.target_type}
                      </span>
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-2 text-xs bg-muted/50 rounded p-2">
                        {Object.entries(log.metadata).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{key}:</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(log.created_at)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
