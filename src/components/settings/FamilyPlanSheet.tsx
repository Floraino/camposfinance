import { useState } from "react";
import { X, Crown, Check, ChevronRight, Home, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/hooks/useHousehold";
import { PLAN_COMPARISON, PRO_PRICING } from "@/services/planService";
import { PlanBadge } from "@/components/paywall/PlanBadge";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";

interface FamilyPlanSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FamilyPlanSheet({ isOpen, onClose }: FamilyPlanSheetProps) {
  const { currentHousehold, planType, isAdmin, plan, households } = useHousehold();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isPro = planType === "PRO";

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Crown className={isPro ? "w-5 h-5 text-amber-500" : "w-5 h-5 text-muted-foreground"} />
              Plano da Família
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

                {plan && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span className={plan.status === "active" ? "text-green-500" : "text-muted-foreground"}>
                        {plan.status === "active" ? "Ativo" : plan.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Desde</span>
                      <span className="text-foreground">{formatDate(plan.started_at)}</span>
                    </div>
                    {plan.expires_at && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Expira em</span>
                        <span className="text-foreground">{formatDate(plan.expires_at)}</span>
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

                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">A partir de</p>
                      <p className="text-lg font-bold text-foreground">
                        R$ {PRO_PRICING.monthly.amount.toFixed(2).replace(".", ",")}/mês
                      </p>
                    </div>
                    {!isAdmin && (
                      <span className="text-xs text-muted-foreground">
                        Apenas admins
                      </span>
                    )}
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                    disabled={!isAdmin}
                    onClick={() => setShowUpgradeModal(true)}
                  >
                    {isAdmin ? "Ver planos" : "Fale com o administrador"}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}

              {/* Manage subscription for PRO users */}
              {isPro && isAdmin && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                    Gerenciar assinatura
                  </h4>
                  <div className="glass-card overflow-hidden">
                    <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">Alterar forma de pagamento</p>
                        <p className="text-sm text-muted-foreground truncate">
                          Cartão ou PIX
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors border-t border-border">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-destructive">Cancelar assinatura</p>
                        <p className="text-sm text-muted-foreground truncate">
                          Você voltará ao plano Basic
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              )}

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
    </>
  );
}
