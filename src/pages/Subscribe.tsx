import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Crown, Loader2, Check, ArrowLeft, Shield, CreditCard, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { createCheckout, PRO_PRICING, type PriceType } from "@/services/subscriptionService";
import { useToast } from "@/hooks/use-toast";

export default function Subscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { currentHousehold, isAdmin, isLoading: householdLoading, switchHousehold, households } = useHousehold();
  const { toast } = useToast();
  
  const [isLoadingCheckout, setIsLoadingCheckout] = useState<PriceType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PriceType>("yearly");
  
  // Get params from URL
  const householdIdParam = searchParams.get("householdId");
  const planParam = searchParams.get("plan") as PriceType | null;
  
  // Set initial plan from URL
  useEffect(() => {
    if (planParam && ["monthly", "yearly"].includes(planParam)) {
      setSelectedPlan(planParam);
    }
  }, [planParam]);

  // If householdId in URL, try to select it
  useEffect(() => {
    if (householdIdParam && households.length > 0 && currentHousehold?.id !== householdIdParam) {
      const household = households.find(h => h.id === householdIdParam);
      if (household) {
        switchHousehold(household);
      }
    }
  }, [householdIdParam, households, currentHousehold?.id, switchHousehold]);

  const handleSubscribe = async () => {
    const targetHouseholdId = householdIdParam || currentHousehold?.id;
    
    if (!targetHouseholdId) {
      toast({
        title: "Erro",
        description: "Nenhuma família selecionada",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoadingCheckout(selectedPlan);
    try {
      const checkoutUrl = await createCheckout(targetHouseholdId, selectedPlan);
      // Redirect to checkout in same tab for web experience
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar checkout",
        variant: "destructive",
      });
      setIsLoadingCheckout(null);
    }
  };

  // Loading state
  if (authLoading || householdLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-6">
          <Crown className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Assine o PRO</h1>
        <p className="text-muted-foreground text-center mb-6">
          Faça login para continuar com a assinatura
        </p>
        <Button onClick={() => navigate("/auth")}>
          Fazer Login
        </Button>
      </div>
    );
  }

  // No household or not admin
  if (!currentHousehold || (!isAdmin && !householdIdParam)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
          <Users className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h1>
        <p className="text-muted-foreground text-center mb-6">
          {!currentHousehold 
            ? "Selecione uma família para assinar o PRO" 
            : "Apenas administradores podem assinar o plano PRO"}
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Voltar ao App
        </Button>
      </div>
    );
  }

  const features = [
    "OCR automático de cupons fiscais",
    "Contas ilimitadas",
    "Assistente IA completo",
    "Importação CSV ilimitada",
    "Exportações em PDF/Excel",
    "Gráficos avançados",
    "Suporte prioritário",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-foreground">Assinar PRO</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Família PRO
          </h2>
          <p className="text-muted-foreground">
            Desbloqueie todos os recursos para {currentHousehold.name}
          </p>
        </div>

        {/* Plan Selection */}
        <div className="space-y-3">
          {/* Annual Plan */}
          <button
            onClick={() => setSelectedPlan("yearly")}
            className={`w-full p-4 rounded-2xl border-2 transition-all text-left ${
              selectedPlan === "yearly" 
                ? "border-amber-500 bg-amber-500/10" 
                : "border-border bg-card hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Anual</span>
                <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                  {PRO_PRICING.yearly.savings}
                </span>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedPlan === "yearly" ? "border-amber-500 bg-amber-500" : "border-muted-foreground/50"
              }`}>
                {selectedPlan === "yearly" && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">R$ {PRO_PRICING.yearly.amount.toFixed(2).replace(".", ",")}</span>
              <span className="text-muted-foreground">/ano</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Apenas R$ {(PRO_PRICING.yearly.amount / 12).toFixed(2).replace(".", ",")}/mês
            </p>
          </button>

          {/* Monthly Plan */}
          <button
            onClick={() => setSelectedPlan("monthly")}
            className={`w-full p-4 rounded-2xl border-2 transition-all text-left ${
              selectedPlan === "monthly" 
                ? "border-amber-500 bg-amber-500/10" 
                : "border-border bg-card hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-foreground">Mensal</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedPlan === "monthly" ? "border-amber-500 bg-amber-500" : "border-muted-foreground/50"
              }`}>
                {selectedPlan === "monthly" && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">R$ {PRO_PRICING.monthly.amount.toFixed(2).replace(".", ",")}</span>
              <span className="text-muted-foreground">/mês</span>
            </div>
          </button>
        </div>

        {/* Features */}
        <div className="bg-card rounded-2xl p-4 border border-border">
          <h3 className="font-semibold text-foreground mb-3">Incluído no PRO:</h3>
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li key={index} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-green-500" />
                </div>
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <Button
          onClick={handleSubscribe}
          disabled={isLoadingCheckout !== null}
          className="w-full h-14 text-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/20"
        >
          {isLoadingCheckout ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Crown className="w-5 h-5 mr-2" />
              Assinar Agora
            </>
          )}
        </Button>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-4 h-4" />
            <span>Pagamento seguro</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="w-4 h-4" />
            <span>via Stripe</span>
          </div>
        </div>

        {/* Fine print */}
        <p className="text-xs text-center text-muted-foreground px-4">
          Ao assinar, você concorda com os termos de uso. O plano será compartilhado com todos os membros da família. Você pode cancelar a qualquer momento pelo portal de gerenciamento.
        </p>
      </main>
    </div>
  );
}
