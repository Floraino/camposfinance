import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHousehold } from "@/hooks/useHousehold";
import { PlanBadge } from "@/components/paywall/PlanBadge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Home, ChevronRight, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HouseholdSwitcherProps {
  children: React.ReactNode;
}

export function HouseholdSwitcher({ children }: HouseholdSwitcherProps) {
  const { households, currentHousehold, switchHousehold, createNewHousehold } = useHousehold();
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSelect = (household: typeof households[0]) => {
    switchHousehold(household);
    setOpen(false);
    toast({
      title: "Família alterada",
      description: `Agora você está em "${household.name}"`,
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
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
      setOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao criar",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
      setNewName("");
      setShowCreateForm(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Trocar Família</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 overflow-y-auto max-h-[calc(70vh-120px)]">
          {households.map((household) => (
            <button
              key={household.id}
              onClick={() => handleSelect(household)}
              className={`w-full bg-card border rounded-2xl p-4 flex items-center gap-4 transition-colors ${
                currentHousehold?.id === household.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-card/80"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Home className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-foreground">{household.name}</h3>
                <HouseholdPlanLabel householdId={household.id} />
              </div>
              {currentHousehold?.id === household.id && (
                <Check className="w-5 h-5 text-primary" />
              )}
            </button>
          ))}

          {/* Create form */}
          {showCreateForm ? (
            <form onSubmit={handleCreate} className="space-y-3 pt-2">
              <div className="bg-card border border-border rounded-2xl p-4">
                <input
                  type="text"
                  placeholder="Nome da nova família"
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
                  {isCreating ? "Criando..." : "Criar"}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Nova Família
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HouseholdPlanLabel({ householdId }: { householdId: string }) {
  const [planType, setPlanType] = useState<"BASIC" | "PRO">("BASIC");

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
    <span className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${
      planType === "PRO" 
        ? "bg-amber-500/20 text-amber-500" 
        : "bg-muted text-muted-foreground"
    }`}>
      {planType}
    </span>
  );
}
