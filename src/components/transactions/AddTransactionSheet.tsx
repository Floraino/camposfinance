import { useState } from "react";
import { X, Camera, Image as ImageIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";

interface AddTransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (transaction: NewTransaction) => void;
}

export interface NewTransaction {
  description: string;
  amount: number;
  category: CategoryType;
  paymentMethod: "pix" | "boleto" | "card" | "cash";
  status: "paid" | "pending";
  isRecurring: boolean;
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

  const handleSubmit = () => {
    if (!description || !amount) return;

    onAdd({
      description,
      amount: -Math.abs(parseFloat(amount.replace(",", "."))),
      category,
      paymentMethod,
      status,
      isRecurring,
    });

    // Reset form
    setDescription("");
    setAmount("");
    setCategory("other");
    setPaymentMethod("pix");
    setStatus("paid");
    setIsRecurring(false);
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
              onClick={() => alert("Em breve: Leitura de cupom fiscal via câmera")}
            >
              <Camera className="w-5 h-5 text-primary" />
              <span>Escanear Cupom</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-14 gap-3"
              onClick={() => alert("Em breve: Upload de imagem")}
            >
              <ImageIcon className="w-5 h-5 text-primary" />
              <span>Enviar Imagem</span>
            </Button>
          </div>
          
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
