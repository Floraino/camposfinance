import { useState, useEffect } from "react";
import { X, Crown, Check, ChevronRight, Home, Ticket, Loader2, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/hooks/useHousehold";
import { PLAN_COMPARISON, PRO_PRICING } from "@/services/planService";
import { PlanBadge } from "@/components/paywall/PlanBadge";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";
import { RedeemCouponSheet } from "./RedeemCouponSheet";
import { createCheckout, checkSubscription, openCustomerPortal, type SubscriptionStatus, type PriceType } from "@/services/subscriptionService";
import { useToast } from "@/hooks/use-toast";

interface FamilyPlanSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FamilyPlanSheet({ isOpen, onClose }: FamilyPlanSheetProps) {
  const { currentHousehold, planType, isAdmin, plan, households, refreshHouseholds } = useHousehold();
  const { toast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRedeemCoupon, setShowRedeemCoupon] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState<PriceType | null>(null);
  
  const isPro = planType === "PRO";

  // Check subscription status on open
  useEffect(() => {
    if (isOpen && currentHousehold?.id) {
      refreshSubscriptionStatus();
    }
  }, [isOpen, currentHousehold?.id]);

  const refreshSubscriptionStatus = async () => {
    if (!currentHousehold?.id) return;
    
    setIsLoadingStatus(true);
    try {
      const status = await checkSubscription(currentHousehold.id);
      setSubscriptionStatus(status);
      
      // Refresh household data if plan changed
      if (status.plan !== planType) {
        await refreshHouseholds();
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleOpenPortal = async () => {
    setIsLoadingPortal(true);
    try {
      const portalUrl = await openCustomerPortal();
      window.open(portalUrl, "_blank");
      toast({
        title: "Portal aberto",
        description: "Uma nova aba foi aberta para gerenciar sua assinatura",
      });
    } catch (error) {
      console.error("Error opening portal:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao abrir portal",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const handleSubscribe = async (priceType: PriceType) => {
    if (!currentHousehold?.id) return;
    
    setIsLoadingCheckout(priceType);
    try {
      const checkoutUrl = await createCheckout(currentHousehold.id, priceType);
      window.open(checkoutUrl, "_blank");
      toast({
        title: "Checkout aberto",
        description: "Uma nova aba foi aberta para completar o pagamento",
      });
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar checkout",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCheckout(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      active: { text: "Ativo", color: "text-green-500" },
      trialing: { text: "Período de teste", color: "text-blue-500" },
      past_due: { text: "Pagamento atrasado", color: "text-amber-500" },
      canceled: { text: "Cancelado", color: "text-red-500" },
      cancelled: { text: "Cancelado", color: "text-red-500" },
      expired: { text: "Expirado", color: "text-muted-foreground" },
    };
    return labels[status] || { text: status, color: "text-muted-foreground" };
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className={isPro ? "w-5 h-5 text-amber-500" : "w-5 h-5 text-muted-foreground"} />
                Plano da Família
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshSubscriptionStatus}
                disabled={isLoadingStatus}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? "animate-spin" : ""}`} />
              </Button>
            </SheetTitle>
          </SheetHeader>

          <div className="overflow-y-auto h-[calc(100%-4rem)] pb-safe">
            <div className="py-4 space-y-6">
              {/* Current household info */}
              <div className="glass-card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Home className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{currentHousehold?.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {households.length} {households.length === 1 ? "família" : "famílias"} no total
                    </p>
                  </div>
                  <PlanBadge size="lg" />
                </div>

                {(plan || subscriptionStatus) && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span className={getStatusLabel(subscriptionStatus?.status || plan?.status || "").color}>
                        {getStatusLabel(subscriptionStatus?.status || plan?.status || "").text}
                      </span>
                    </div>
                    {subscriptionStatus?.provider && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Provedor</span>
                        <span className="text-foreground flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {subscriptionStatus.provider === "subscription" ? "Stripe" : subscriptionStatus.provider}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Desde</span>
                      <span className="text-foreground">{formatDate(plan?.started_at)}</span>
                    </div>
                    {(subscriptionStatus?.pro_expires_at || plan?.pro_expires_at) && isPro && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Renova em</span>
                        <span className="text-foreground">
                          {formatDate(subscriptionStatus?.pro_expires_at || plan?.pro_expires_at)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Current plan features */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                  Seu plano inclui
                </h4>
                <div className="glass-card divide-y divide-border overflow-hidden">
                  {PLAN_COMPARISON.map((item, index) => {
                    const value = isPro ? item.pro : item.basic;
                    const isIncluded = value !== "✗";
                    
                    return (
                      <div key={index} className="flex items-center gap-3 p-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isIncluded ? "bg-green-500/20" : "bg-muted"
                        }`}>
                          {isIncluded ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <span className={`flex-1 text-sm ${isIncluded ? "text-foreground" : "text-muted-foreground"}`}>
                          {item.feature}
                        </span>
                        <span className={`text-sm ${isIncluded ? "text-foreground" : "text-muted-foreground"}`}>
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upgrade CTA for BASIC users */}
              {!isPro && (
                <div className="glass-card p-4 border-amber-500/30">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <Crown className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Desbloqueie o PRO</h3>
                      <p className="text-sm text-muted-foreground">
                        OCR automático, contas ilimitadas, IA completa e muito mais.
                      </p>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="space-y-3">
                      {/* Annual Plan */}
                      <Button
                        className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                        onClick={() => handleSubscribe("yearly")}
                        disabled={isLoadingCheckout !== null}
                      >
                        {isLoadingCheckout === "yearly" ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <Crown className="w-5 h-5" />
                              <span>Anual</span>
                              <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                                {PRO_PRICING.yearly.savings}
                              </span>
                            </div>
                            <span className="font-bold">
                              R$ {PRO_PRICING.yearly.amount.toFixed(2).replace(".", ",")}/ano
                            </span>
                          </div>
                        )}
                      </Button>

                      {/* Monthly Plan */}
                      <Button
                        variant="outline"
                        className="w-full h-12"
                        onClick={() => handleSubscribe("monthly")}
                        disabled={isLoadingCheckout !== null}
                      >
                        {isLoadingCheckout === "monthly" ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <span>Mensal</span>
                            <span className="font-bold">
                              R$ {PRO_PRICING.monthly.amount.toFixed(2).replace(".", ",")}/mês
                            </span>
                          </div>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-sm text-muted-foreground">
                        Apenas admins podem assinar
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Manage subscription for PRO users */}
              {isPro && isAdmin && subscriptionStatus?.subscription_id && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                    Gerenciar assinatura
                  </h4>
                  <div className="glass-card overflow-hidden">
                    <button 
                      className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={handleOpenPortal}
                      disabled={isLoadingPortal}
                    >
                      {isLoadingPortal ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground flex items-center gap-2">
                              Gerenciar no Stripe
                              <ExternalLink className="w-3 h-3" />
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              Alterar pagamento, cancelar ou trocar plano
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Redeem Coupon - only for admins */}
              {isAdmin && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowRedeemCoupon(true)}
                >
                  <Ticket className="w-4 h-4 mr-2" />
                  Resgatar Cupom
                </Button>
              )}

              {/* Secure payment badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <CreditCard className="w-3 h-3" />
                <span>Pagamento seguro via Stripe</span>
              </div>

              {/* Footer info */}
              <p className="text-xs text-center text-muted-foreground px-4">
                O plano é compartilhado por todos os membros da família "{currentHousehold?.name}".
                {!isAdmin && " Apenas administradores podem gerenciar o plano."}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />

      <RedeemCouponSheet
        open={showRedeemCoupon}
        onClose={() => setShowRedeemCoupon(false)}
        onSuccess={() => {
          refreshSubscriptionStatus();
          refreshHouseholds();
        }}
      />
    </>
  );
}
