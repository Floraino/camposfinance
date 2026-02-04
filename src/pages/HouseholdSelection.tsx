import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHousehold } from "@/hooks/useHousehold";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/paywall/PlanBadge";
import { Home, Plus, ChevronRight, Users, Loader2, UserPlus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JoinHouseholdSheet } from "@/components/household/JoinHouseholdSheet";

export default function HouseholdSelection() {
  const { households, switchHousehold, createNewHousehold, isLoading, refreshHouseholds } = useHousehold();
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinSheet, setShowJoinSheet] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Always refresh households when this page mounts to ensure fresh data
  useEffect(() => {
    const fetchFreshHouseholds = async () => {
      setIsRefreshing(true);
      try {
        await refreshHouseholds();
      } finally {
        setIsRefreshing(false);
      }
    };
    fetchFreshHouseholds();
  }, [refreshHouseholds]);

  const handleSelectHousehold = (household: typeof households[0]) => {
    switchHousehold(household);
    navigate("/");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshHouseholds();
      toast({
        title: "Lista atualizada",
        description: "Suas famílias foram atualizadas.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsCreating(true);
    try {
      const household = await createNewHousehold(newName.trim());
      toast({
        title: "Família criada!",
        description: `"${household.name}" foi criada com sucesso.`,
      });
      switchHousehold(household);
      navigate("/");
    } catch (error) {
      toast({
        title: "Erro ao criar família",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
      setNewName("");
      setShowCreateForm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex-1 flex flex-col px-6 py-12">
        {/* Logo and Refresh */}
        <div className="mb-8 text-center relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Selecione sua Família
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Escolha qual família você deseja gerenciar
          </p>
        </div>

        {/* Loading indicator when refreshing */}
        {isRefreshing && (
          <div className="flex justify-center mb-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Households List */}
        <div className="space-y-3 flex-1">
          {households.map((household) => (
            <button
              key={household.id}
              onClick={() => handleSelectHousehold(household)}
              className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-4 hover:bg-card/80 transition-colors active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Home className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-foreground">{household.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <HouseholdPlanBadge householdId={household.id} />
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          ))}

          {/* No households message */}
          {households.length === 0 && !showCreateForm && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Você ainda não faz parte de nenhuma família.
              </p>
            </div>
          )}

          {/* Create new household form */}
          {showCreateForm ? (
            <form onSubmit={handleCreateHousehold} className="space-y-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <input
                  type="text"
                  placeholder="Nome da família (ex: Casa da Praia)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mobile-input"
                  autoFocus
                  maxLength={50}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewName("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  className="flex-1"
                  disabled={isCreating || !newName.trim()}
                >
                  {isCreating ? "Criando..." : "Criar Família"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 mt-4">
              {/* Join existing family button */}
              <Button
                variant="default"
                size="lg"
                className="w-full"
                onClick={() => setShowJoinSheet(true)}
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Entrar em uma Família
              </Button>
              
              {/* Create new family button */}
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="w-5 h-5 mr-2" />
                Criar Nova Família
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground pb-safe py-4 px-6">
        Cada família possui seu próprio plano e dados financeiros
      </p>

      {/* Join Household Sheet */}
      <JoinHouseholdSheet 
        open={showJoinSheet} 
        onClose={() => setShowJoinSheet(false)} 
      />
    </div>
  );
}

// Component to fetch and display plan badge for each household
function HouseholdPlanBadge({ householdId }: { householdId: string }) {
  const [planType, setPlanType] = useState<"BASIC" | "PRO">("BASIC");

  // Fetch plan on mount
  useEffect(() => {
    import("@/services/householdService").then(({ getHouseholdPlan }) => {
      getHouseholdPlan(householdId).then((plan) => {
        if (plan) {
          setPlanType(plan.plan as "BASIC" | "PRO");
        }
      });
    });
  }, [householdId]);

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      planType === "PRO" 
        ? "bg-amber-500/20 text-amber-500" 
        : "bg-muted text-muted-foreground"
    }`}>
      {planType}
    </span>
  );
}
