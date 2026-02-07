import { useState, useRef, useEffect, useCallback } from "react";
import { X, Camera, Image as ImageIcon, ChevronRight, Loader2, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";
import { type NewTransaction } from "@/services/transactionService";
import { createInstallmentPurchase } from "@/services/installmentService";
import { getFamilyMembers, type FamilyMember } from "@/services/familyService";
import { getHouseholdAccounts, type Account } from "@/services/householdService";
import { getCreditCards, type CreditCard } from "@/services/creditCardService";
import { categorizeDescription } from "@/services/categorizationService";
import { applyCategorizationRules } from "@/services/categorizationRulesService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProFeature } from "@/hooks/useProFeature";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";
import { ProBadge } from "@/components/paywall/ProBadge";
interface AddTransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (transaction: NewTransaction) => void;
  householdId: string;
}

const paymentMethods = [
  { id: "pix", label: "PIX" },
  { id: "boleto", label: "Boleto" },
  { id: "card", label: "Cartão" },
  { id: "cash", label: "Dinheiro" },
] as const;

export function AddTransactionSheet({ isOpen, onClose, onAdd, householdId }: AddTransactionSheetProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<CategoryType>("other");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "card" | "cash">("pix");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [dueDate, setDueDate] = useState<string>("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("2");
  const [isScanning, setIsScanning] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [memberId, setMemberId] = useState<string | undefined>(undefined);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [manualCategorySet, setManualCategorySet] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const categorizationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { allowed: canUseOCR } = useProFeature("OCR_SCAN");

  useEffect(() => {
    if (isOpen && householdId) {
      loadFamilyMembers();
      loadAccountsAndCards();
      setManualCategorySet(false);
    }
  }, [isOpen, householdId]);

  const loadAccountsAndCards = async () => {
    if (!householdId) return;
    try {
      const [accs, cards] = await Promise.all([
        getHouseholdAccounts(householdId),
        getCreditCards(householdId),
      ]);
      setAccounts(accs);
      setCreditCards(cards);
    } catch (error) {
      console.error("Error loading accounts/cards:", error);
    }
  };

  // Auto-categorize when description changes
  // Priority: family rules > local keywords > AI edge function
  useEffect(() => {
    if (manualCategorySet || !description || description.length < 3) {
      return;
    }

    // Clear previous timeout
    if (categorizationTimeoutRef.current) {
      clearTimeout(categorizationTimeoutRef.current);
    }

    // Debounce categorization (600ms)
    categorizationTimeoutRef.current = setTimeout(async () => {
      setIsCategorizing(true);
      try {
        // 1) Try family-specific rules first (highest priority)
        if (householdId) {
          const ruleResult = await applyCategorizationRules(householdId, description);
          if (ruleResult.category && ruleResult.category !== "other") {
            setCategory(ruleResult.category);
            // Also pre-select account if the rule defines one
            if (ruleResult.accountId && accounts.some(a => a.id === ruleResult.accountId)) {
              setSelectedAccountId(ruleResult.accountId);
            }
            console.log("[auto-cat] matched family rule:", ruleResult.ruleId);
            return; // done — family rule matched
          }
        }

        // 2) Fallback: local keywords + AI edge function
        const suggestedCategory = await categorizeDescription(description);
        if (suggestedCategory && suggestedCategory !== "other") {
          setCategory(suggestedCategory);
        }
      } catch (error) {
        console.error("Auto-categorization error:", error);
      } finally {
        setIsCategorizing(false);
      }
    }, 600);

    return () => {
      if (categorizationTimeoutRef.current) {
        clearTimeout(categorizationTimeoutRef.current);
      }
    };
  }, [description, manualCategorySet, householdId, accounts]);

  const handleCategorySelect = (cat: CategoryType) => {
    setCategory(cat);
    setManualCategorySet(true);
  };

  const loadFamilyMembers = async () => {
    if (!householdId) return;
    try {
      const members = await getFamilyMembers(householdId);
      setFamilyMembers(members);
    } catch (error) {
      console.error("Error loading family members:", error);
    }
  };

  const handleScanCouponClick = () => {
    if (!canUseOCR) {
      setShowUpgradeModal(true);
      return;
    }
    cameraInputRef.current?.click();
  };

  const handleSendImageClick = () => {
    // PRO feature - show upgrade modal for BASIC users
    if (!canUseOCR) {
      setShowUpgradeModal(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (file: File, isFromCamera: boolean = false) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem",
        variant: "destructive",
      });
      return;
    }

    // Store the image as attachment preview
    const previewReader = new FileReader();
    previewReader.onload = () => {
      setAttachedImage(previewReader.result as string);
    };
    previewReader.readAsDataURL(file);

    // If PRO and from camera (Escanear Cupom), always do OCR
    // If PRO and from file (Enviar Imagem), also do OCR
    // If BASIC, just attach image without OCR
    if (canUseOCR) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await processImage(base64, file.type);
      };
      reader.readAsDataURL(file);
    } else {
      // BASIC: just attach image, don't process OCR
      toast({
        title: "Imagem anexada",
        description: "Preencha os dados manualmente abaixo",
      });
      // Reset file inputs
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const processImage = async (imageBase64: string, mimeType: string) => {
    setIsScanning(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Sessão expirada",
          description: "Por favor, faça login novamente",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-receipt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ imageBase64, mimeType, householdId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Handle PRO_REQUIRED error specifically
        if (data.code === "PRO_REQUIRED") {
          setShowUpgradeModal(true);
          return;
        }
        throw new Error(data.error || "Erro ao processar imagem");
      }

      // Fill form with extracted data
      setDescription(data.description || data.establishment || "");
      setAmount(data.amount?.toString().replace(".", ",") || "");
      setCategory(data.category as CategoryType || "other");
      setPaymentMethod(data.paymentMethod as "pix" | "boleto" | "card" | "cash" || "card");
      
      toast({
        title: "Dados extraídos!",
        description: `Confiança: ${Math.round((data.confidence || 0.5) * 100)}%`,
      });
    } catch (error) {
      console.error("Error scanning receipt:", error);
      toast({
        title: "Erro ao ler imagem",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
      // Reset file inputs
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleContinueManually = () => {
    setShowUpgradeModal(false);
    // Form is already open, user can fill manually
  };

  const handleSubmit = async () => {
    if (!description || !amount) return;
    if (paymentMethod === "card" && creditCards.length > 0 && !selectedCardId) {
      toast({ title: "Selecione um cartão", variant: "destructive" });
      return;
    }

    const parsedAmount = Math.abs(parseFloat(amount.replace(",", ".")));

    // Handle installment purchase
    if (isInstallment && parseInt(installmentCount) >= 2) {
      try {
        const now = new Date();
        const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        await createInstallmentPurchase(householdId, {
          description,
          totalAmount: parsedAmount,
          installmentCount: parseInt(installmentCount),
          startMonth,
          category,
          memberId,
        });
        toast({ title: `Parcelamento criado: ${installmentCount}x` });
      } catch (err) {
        console.error("[installment] create error:", err);
        toast({ title: "Erro ao criar parcelamento", variant: "destructive" });
        return;
      }
    } else {
      // Normal single transaction
      onAdd({
        description,
        amount: -parsedAmount,
        category,
        payment_method: paymentMethod,
        status,
        is_recurring: false,
        member_id: memberId,
        ...(dueDate ? { due_date: dueDate } : {}),
        account_id: selectedAccountId || null,
        credit_card_id: paymentMethod === "card" ? (selectedCardId || null) : null,
      });
    }

    // Reset form
    setDescription("");
    setAmount("");
    setCategory("other");
    setPaymentMethod("pix");
    setStatus("paid");
    setIsInstallment(false);
    setInstallmentCount("2");
    setDueDate("");
    setMemberId(undefined);
    setManualCategorySet(false);
    setAttachedImage(null);
    setSelectedAccountId(undefined);
    setSelectedCardId(undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Novo Gasto</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4 space-y-6 pb-safe">
          {/* OCR Buttons */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1 h-14 gap-2 relative"
              onClick={handleScanCouponClick}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-primary" />
              )}
              <span className="text-sm">{isScanning ? "Analisando..." : "Escanear Cupom"}</span>
              <ProBadge show={!canUseOCR} className="absolute -top-2 -right-2" />
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-14 gap-2 relative"
              onClick={handleSendImageClick}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5 text-primary" />
              )}
              <span className="text-sm">{isScanning ? "Analisando..." : "Enviar Imagem"}</span>
              <ProBadge show={!canUseOCR} className="absolute -top-2 -right-2" />
            </Button>
          </div>

          {/* Attached image preview */}
          {attachedImage && (
            <div className="relative">
              <img 
                src={attachedImage} 
                alt="Imagem anexada" 
                className="w-full h-32 object-cover rounded-xl border border-border"
              />
              <Button
                variant="destructive"
                size="icon-sm"
                className="absolute top-2 right-2"
                onClick={() => setAttachedImage(null)}
              >
                <X className="w-4 h-4" />
              </Button>
              {!canUseOCR && (
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Imagem anexada • Preencha os dados manualmente
                </p>
              )}
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0], true)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0], false)}
          />
          
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">ou preencha manualmente</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          
          {/* Amount Input */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Valor
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mobile-input pl-12 text-2xl font-bold"
              />
            </div>
          </div>
          
          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Descrição
            </label>
            <input
              type="text"
              placeholder="Ex: Supermercado, Conta de luz..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mobile-input"
            />
          </div>
          
          {/* Category Selection */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              Categoria
              {isCategorizing && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  Detectando...
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(categoryConfig) as CategoryType[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  className={cn(
                    "transition-all duration-200",
                    category === cat && "ring-2 ring-primary ring-offset-2 ring-offset-card rounded-full"
                  )}
                >
                  <CategoryBadge category={cat} size="md" />
                </button>
              ))}
            </div>
          </div>
          
          {/* Payment Method */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-3 block">
              Forma de Pagamento
            </label>
            <div className="grid grid-cols-4 gap-2">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={cn(
                    "h-12 rounded-xl border-2 text-sm font-medium transition-all duration-200",
                    paymentMethod === method.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Account Selection — only when accounts exist */}
          {accounts.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-3 block">
                🏦 Conta / Banco
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedAccountId(undefined)}
                  className={cn(
                    "h-10 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200",
                    !selectedAccountId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  Geral
                </button>
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={cn(
                      "h-10 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200",
                      selectedAccountId === acc.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Credit Card Selection — only when payment = card AND cards exist */}
          {paymentMethod === "card" && creditCards.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-3 block">
                💳 Cartão
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCardId(undefined)}
                  className={cn(
                    "h-10 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200",
                    !selectedCardId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  Sem cartão
                </button>
                {creditCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    className={cn(
                      "h-10 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200",
                      selectedCardId === card.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {card.name}{card.last_four ? ` •${card.last_four}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status Toggle */}
          <div className="flex gap-3">
            <button
              onClick={() => setStatus("paid")}
              className={cn(
                "flex-1 h-12 rounded-xl border-2 font-medium transition-all duration-200",
                status === "paid"
                  ? "border-success bg-success/10 text-success"
                  : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              ✓ Pago
            </button>
            <button
              onClick={() => setStatus("pending")}
              className={cn(
                "flex-1 h-12 rounded-xl border-2 font-medium transition-all duration-200",
                status === "pending"
                  ? "border-warning bg-warning/10 text-warning"
                  : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              ⏳ Pendente
            </button>
          </div>

          {/* Due Date (only when pending) */}
          {status === "pending" && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                📅 Data de vencimento
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border-2 border-border bg-muted/50 text-foreground focus:border-primary focus:ring-0 outline-none transition-all"
                placeholder="Selecione a data"
              />
            </div>
          )}

          {/* Family Member Selection */}
          {familyMembers.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-3 block">
                Quem gastou?
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setMemberId(undefined)}
                  className={cn(
                    "h-10 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200 flex items-center gap-2",
                    !memberId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  <User className="w-4 h-4" />
                  Eu
                </button>
                {familyMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => setMemberId(member.id)}
                    className={cn(
                      "h-10 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200 flex items-center gap-2",
                      memberId === member.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <User className="w-4 h-4" />
                    {member.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Recurring toggle removed from UI — is_recurring defaults to false */}

          {/* Installment Toggle */}
          <button
            onClick={() => setIsInstallment(!isInstallment)}
            className={cn(
              "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200",
              isInstallment
                ? "border-primary bg-primary/10"
                : "border-border bg-muted/50"
            )}
          >
            <span className={cn(
              "font-medium",
              isInstallment ? "text-primary" : "text-muted-foreground"
            )}>
              💳 Parcelado
            </span>
            <ChevronRight className={cn(
              "w-5 h-5 transition-transform",
              isInstallment && "rotate-90"
            )} />
          </button>

          {isInstallment && (
            <div className="pl-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Número de parcelas
                </label>
                <div className="flex gap-2 flex-wrap">
                  {["2", "3", "4", "5", "6", "8", "10", "12"].map((n) => (
                    <button
                      key={n}
                      onClick={() => setInstallmentCount(n)}
                      className={cn(
                        "px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                        installmentCount === n
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/50 text-muted-foreground"
                      )}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
              {amount && (
                <p className="text-sm text-muted-foreground">
                  {installmentCount}x de{" "}
                  <span className="font-semibold text-foreground">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                      Math.abs(parseFloat(amount.replace(",", ".")) || 0) / parseInt(installmentCount)
                    )}
                  </span>
                </p>
              )}
            </div>
          )}
          
          {/* Submit Button */}
          <Button 
            variant="accent" 
            size="lg" 
            className="w-full"
            onClick={handleSubmit}
            disabled={!description || !amount}
          >
            Adicionar Gasto
          </Button>
        </div>
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="ocr"
        onContinueManually={handleContinueManually}
      />
    </div>
  );
}
