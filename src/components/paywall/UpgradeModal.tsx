import { X, Crown, ScanLine, Wallet, Brain, FileText, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/hooks/useHousehold";
import { PRO_PRICING, PLAN_COMPARISON } from "@/services/planService";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: "ocr" | "accounts" | "ai" | "export" | "csv";
  onUpgrade?: () => void;
  onContinueManually?: () => void;
}

const featureMessages = {
  ocr: {
    icon: ScanLine,
    title: "OCR Automático",
    description: "Leitura automática de cupons fiscais, notas e comprovantes com extração inteligente de dados.",
    showManualOption: true,
  },
  accounts: {
    icon: Wallet,
    title: "Contas Ilimitadas",
    description: "Famílias no plano Basic podem ter até 2 contas. Atualize para criar quantas precisar.",
    showManualOption: false,
  },
  ai: {
    icon: Brain,
    title: "IA Financeira Completa",
    description: "Análises avançadas, sugestões personalizadas e alertas inteligentes para sua família.",
    showManualOption: false,
  },
  export: {
    icon: FileText,
    title: "Exportação de Relatórios",
    description: "Exporte seus dados em PDF e Excel para análise detalhada.",
    showManualOption: false,
  },
  csv: {
    icon: Upload,
    title: "Importação CSV",
    description: "Importe transações de planilhas e extratos bancários automaticamente.",
    showManualOption: false,
  },
};

export function UpgradeModal({ isOpen, onClose, feature = "ocr", onUpgrade, onContinueManually }: UpgradeModalProps) {
  const { isAdmin, currentHousehold } = useHousehold();
  const featureInfo = featureMessages[feature];
  const Icon = featureInfo.icon;

  if (!isOpen) return null;

  const handleUpgrade = () => {
    // TODO: Integrate with Stripe
    onUpgrade?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-foreground">Plano PRO</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4 space-y-6 pb-safe">
          {/* Feature highlight */}
          <div className="glass-card p-4 border-amber-500/30">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">{featureInfo.title}</h3>
                <p className="text-sm text-muted-foreground">{featureInfo.description}</p>
              </div>
            </div>
          </div>

          {/* Plan comparison */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Compare os planos</h4>
            <div className="glass-card overflow-hidden">
              <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 text-sm font-medium">
                <span>Recurso</span>
                <span className="text-center">Basic</span>
                <span className="text-center text-amber-500">Pro</span>
              </div>
              {PLAN_COMPARISON.map((item, index) => (
                <div key={index} className="grid grid-cols-3 gap-2 p-3 border-t border-border text-sm">
                  <span className="text-muted-foreground">{item.feature}</span>
                  <span className="text-center">{item.basic}</span>
                  <span className="text-center text-amber-500">{item.pro}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-3">
            <div className="glass-card p-4 border-amber-500/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-amber-500 text-amber-950 text-xs font-medium px-2 py-1 rounded-bl-lg">
                Mais popular
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-foreground">Anual</p>
                  <p className="text-xs text-amber-500">{PRO_PRICING.yearly.savings}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">
                    R$ {PRO_PRICING.yearly.amount.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-xs text-muted-foreground">/ano</p>
                </div>
              </div>
            </div>
            
            <div className="glass-card p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-foreground">Mensal</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-foreground">
                    R$ {PRO_PRICING.monthly.amount.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-xs text-muted-foreground">/mês</p>
                </div>
              </div>
            </div>
          </div>

          {/* PRO benefits list */}
          <div className="space-y-2">
            {[
              "OCR automático de cupons e notas",
              "Contas bancárias ilimitadas",
              "IA financeira completa",
              "Exportação PDF e Excel",
              "Relatórios mensais e anuais",
            ].map((benefit, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-muted-foreground">{benefit}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          {isAdmin ? (
            <div className="space-y-3">
              <Button 
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold"
                onClick={handleUpgrade}
              >
                <Crown className="w-5 h-5 mr-2" />
                Ativar Pro para a Família
              </Button>
              {featureInfo.showManualOption && onContinueManually && (
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onContinueManually();
                    onClose();
                  }}
                >
                  Continuar manualmente
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Apenas o administrador da família pode gerenciar o plano.
              </p>
              <p className="text-xs text-muted-foreground">
                Peça ao dono da casa "{currentHousehold?.name}" para fazer o upgrade.
              </p>
              {featureInfo.showManualOption && onContinueManually && (
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onContinueManually();
                    onClose();
                  }}
                >
                  Continuar manualmente
                </Button>
              )}
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground">
            Cancele quando quiser. Sem compromisso.
          </p>
        </div>
      </div>
    </div>
  );
}
