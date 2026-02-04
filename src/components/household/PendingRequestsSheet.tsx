import { useState, useEffect } from "react";
import { useHousehold } from "@/hooks/useHousehold";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserCheck, UserX, Loader2, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PendingRequestsSheetProps {
  open: boolean;
  onClose: () => void;
}

interface JoinRequest {
  id: string;
  user_id: string;
  requested_at: string;
  profile?: {
    display_name: string;
    avatar_url: string | null;
  };
}

export function PendingRequestsSheet({ open, onClose }: PendingRequestsSheetProps) {
  const { currentHousehold, isAdmin } = useHousehold();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && currentHousehold && isAdmin) {
      loadRequests();
    }
  }, [open, currentHousehold, isAdmin]);

  const loadRequests = async () => {
    if (!currentHousehold) return;
    
    setIsLoading(true);
    try {
      // Get pending requests
      const { data: requestsData, error: requestsError } = await supabase
        .from("household_join_requests")
        .select("id, user_id, requested_at")
        .eq("household_id", currentHousehold.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });

      if (requestsError) throw requestsError;

      // Get profiles for each user
      const userIds = requestsData?.map(r => r.user_id) || [];
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);

        const requestsWithProfiles = requestsData?.map(request => ({
          ...request,
          profile: profiles?.find(p => p.user_id === request.user_id),
        })) || [];

        setRequests(requestsWithProfiles);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.error("Error loading requests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespond = async (requestId: string, approve: boolean) => {
    setProcessingId(requestId);
    try {
      const { data, error } = await supabase.rpc("respond_to_join_request", {
        _request_id: requestId,
        _approve: approve,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        toast({
          title: "Erro",
          description: result.error || "Erro ao processar solicitação",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: approve ? "Membro aprovado!" : "Solicitação rejeitada",
        description: result.message,
      });

      // Remove from list
      setRequests(requests.filter(r => r.id !== requestId));
    } catch (err) {
      console.error("Error responding to request:", err);
      toast({
        title: "Erro",
        description: "Erro ao processar solicitação. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return "Agora mesmo";
    if (hours < 24) return `Há ${hours}h`;
    if (days === 1) return "Ontem";
    return `Há ${days} dias`;
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[60vh] rounded-t-3xl pb-safe">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <SheetTitle>Solicitações Pendentes</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {requests.length} {requests.length === 1 ? "pessoa aguardando" : "pessoas aguardando"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-3 overflow-y-auto max-h-[calc(60vh-120px)]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8">
              <UserCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Nenhuma solicitação pendente
              </p>
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {request.profile?.avatar_url ? (
                      <img 
                        src={request.profile.avatar_url} 
                        alt="" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {request.profile?.display_name || "Usuário"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(request.requested_at)}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleRespond(request.id, false)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <UserX className="w-4 h-4 mr-1" />
                        Recusar
                      </>
                    )}
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleRespond(request.id, true)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4 mr-1" />
                        Aprovar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
