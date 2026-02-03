import { useState, useRef, useEffect } from "react";
import { X, Camera, Image as ImageIcon, ChevronRight, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";
import { type NewTransaction } from "@/services/transactionService";
import { getFamilyMembers, type FamilyMember } from "@/services/familyService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddTransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (transaction: NewTransaction) => void;
}

const paymentMethods = [
  { id: "pix", label: "PIX" },
  { id: "boleto", label: "Boleto" },
  { id: "card", label: "Cartão" },
  { id: "cash", label: "Dinheiro" },
] as const;

export function AddTransactionSheet({ isOpen, onClose, onAdd }: AddTransactionSheetProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<CategoryType>("other");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "card" | "cash">("pix");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [isRecurring, setIsRecurring] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [memberId, setMemberId] = useState<string | undefined>(undefined);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadFamilyMembers();
    }
  }, [isOpen]);

  const loadFamilyMembers = async () => {
    try {
      const members = await getFamilyMembers();
      setFamilyMembers(members);
    } catch (error) {
      console.error("Error loading family members:", error);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem",
        variant: "destructive",
      });
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      await processImage(base64, file.type);
    };
    reader.readAsDataURL(file);
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
          body: JSON.stringify({ imageBase64, mimeType }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
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

  const handleSubmit = () => {
    if (!description || !amount) return;

    onAdd({
      description,
      amount: -Math.abs(parseFloat(amount.replace(",", "."))),
      category,
      payment_method: paymentMethod,
      status,
      is_recurring: isRecurring,
      member_id: memberId,
    });

    // Reset form
    setDescription("");
    setAmount("");
    setCategory("other");
    setPaymentMethod("pix");
    setStatus("paid");
    setIsRecurring(false);
    setMemberId(undefined);
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
              className="flex-1 h-14 gap-3"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-primary" />
              )}
              <span>{isScanning ? "Analisando..." : "Escanear Cupom"}</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-14 gap-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5 text-primary" />
              )}
              <span>{isScanning ? "Analisando..." : "Enviar Imagem"}</span>
            </Button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
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
            <label className="text-sm font-medium text-muted-foreground mb-3 block">
              Categoria
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(categoryConfig) as CategoryType[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
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
          
          {/* Recurring Toggle */}
          <button
            onClick={() => setIsRecurring(!isRecurring)}
            className={cn(
              "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200",
              isRecurring
                ? "border-primary bg-primary/10"
                : "border-border bg-muted/50"
            )}
          >
            <span className={cn(
              "font-medium",
              isRecurring ? "text-primary" : "text-muted-foreground"
            )}>
              🔄 Gasto recorrente
            </span>
            <ChevronRight className={cn(
              "w-5 h-5 transition-transform",
              isRecurring && "rotate-90"
            )} />
          </button>
          
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
    </div>
  );
}
