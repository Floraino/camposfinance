import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAdminHouseholds, grantProDays, setHouseholdPlan, AdminHousehold } from "@/services/adminService";
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
  ArrowLeft, Search, Home, Crown, Users, 
  CreditCard, Loader2, Plus, Calendar, AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminHouseholds() {
  const [households, setHouseholds] = useState<AdminHousehold[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedHousehold, setSelectedHousehold] = useState<AdminHousehold | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showGrantDays, setShowGrantDays] = useState(false);
  const [daysToGrant, setDaysToGrant] = useState("30");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadHouseholds();
  }, []);

  const loadHouseholds = async (searchTerm?: string) => {
    setIsLoading(true);
    try {
      const data = await getAdminHouseholds(searchTerm);
      setHouseholds(data);
    } catch (error) {
      console.error("Error loading households:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    loadHouseholds(search || undefined);
  };

  const handleGrantDays = async () => {
    if (!selectedHousehold) return;
    
    setIsProcessing(true);
    try {
      const result = await grantProDays(selectedHousehold.id, parseInt(daysToGrant));
      if (result.success) {
        toast({ title: "Pro concedido!", description: `${daysToGrant} dias adicionados.` });
        loadHouseholds(search || undefined);
        setShowGrantDays(false);
      } else {
        toast({ title: "Erro", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao conceder Pro", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetBasic = async () => {
    if (!selectedHousehold) return;
    
    // Check if household has more than 2 accounts
    if ((selectedHousehold.accounts_count || 0) > 2) {
      toast({
        title: "Atenção",
        description: `Esta família tem ${selectedHousehold.accounts_count} contas. No BASIC, o limite é 2. As contas existentes não serão excluídas, mas não poderão criar novas.`,
        variant: "destructive",
      });
    }

    setIsProcessing(true);
    try {
      const result = await setHouseholdPlan(selectedHousehold.id, "BASIC");
      if (result.success) {
        toast({ title: "Plano alterado", description: "Família agora é BASIC" });
        loadHouseholds(search || undefined);
        setShowDetail(false);
      } else {
        toast({ title: "Erro", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao alterar plano", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("pt-BR");
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
          <h1 className="text-lg font-bold">Famílias</h1>
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
            {households.map((household) => (
              <Card
                key={household.id}
                className="p-4 cursor-pointer hover:bg-card/80 transition-colors"
                onClick={() => {
                  setSelectedHousehold(household);
                  setShowDetail(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Home className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{household.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        household.plan?.plan === "PRO" 
                          ? "bg-amber-500/20 text-amber-500" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {household.plan?.plan || "BASIC"}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span>{household.members_count} membros</span>
                      <span>{household.accounts_count} contas</span>
                      <span>{household.transactions_count} transações</span>
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
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Home className="w-5 h-5" />
              {selectedHousehold?.name}
            </SheetTitle>
          </SheetHeader>

          {selectedHousehold && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(80vh-120px)]">
              {/* Plan Info */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Plano Atual</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    selectedHousehold.plan?.plan === "PRO"
                      ? "bg-amber-500/20 text-amber-500"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {selectedHousehold.plan?.plan || "BASIC"}
                  </span>
                </div>
                {selectedHousehold.plan?.plan === "PRO" && selectedHousehold.plan?.pro_expires_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Expira em: {formatDate(selectedHousehold.plan.pro_expires_at)}</span>
                  </div>
                )}
                {selectedHousehold.plan?.source && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Origem: {selectedHousehold.plan.source}
                  </p>
                )}
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <Users className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{selectedHousehold.members_count}</p>
                  <p className="text-xs text-muted-foreground">Membros</p>
                </Card>
                <Card className="p-3 text-center">
                  <CreditCard className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{selectedHousehold.accounts_count}</p>
                  <p className="text-xs text-muted-foreground">Contas</p>
                </Card>
                <Card className="p-3 text-center">
                  <Crown className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{selectedHousehold.transactions_count}</p>
                  <p className="text-xs text-muted-foreground">Transações</p>
                </Card>
              </div>

              {/* Warning for BASIC with many accounts */}
              {selectedHousehold.plan?.plan !== "PRO" && (selectedHousehold.accounts_count || 0) > 2 && (
                <Card className="p-3 bg-amber-500/10 border-amber-500/30">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-500">
                      Esta família BASIC tem {selectedHousehold.accounts_count} contas (limite: 2).
                    </p>
                  </div>
                </Card>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-4">
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => setShowGrantDays(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Conceder Dias Pro
                </Button>

                {selectedHousehold.plan?.plan === "PRO" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleSetBasic}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Voltar para BASIC"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Grant Days Sheet */}
      <Sheet open={showGrantDays} onOpenChange={setShowGrantDays}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Conceder Dias Pro</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Quantidade de dias
              </label>
              <Input
                type="number"
                value={daysToGrant}
                onChange={(e) => setDaysToGrant(e.target.value)}
                min="1"
                max="365"
              />
            </div>

            <div className="flex gap-2">
              {[7, 30, 90, 180].map((days) => (
                <Button
                  key={days}
                  variant="outline"
                  size="sm"
                  onClick={() => setDaysToGrant(String(days))}
                  className={daysToGrant === String(days) ? "border-primary" : ""}
                >
                  {days}d
                </Button>
              ))}
            </div>

            <Button
              variant="accent"
              className="w-full"
              onClick={handleGrantDays}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `Conceder ${daysToGrant} dias`
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
