import { useState, useEffect } from "react";
import { Check, AlertCircle, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryBadge, type CategoryType } from "@/components/ui/CategoryBadge";
import { addTransaction } from "@/services/transactionService";
import { useToast } from "@/hooks/use-toast";

export interface ExtractedReceipt {
  description: string;
  amount: number;
  date: string;
  category: string;
  paymentMethod: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  establishment: string;
  confidence: number;
}

interface ReceiptReviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  extractedData: ExtractedReceipt;
  onSave: () => void;
}

const categoryOptions: { value: CategoryType; label: string }[] = [
  { value: "food", label: "Alimentação" },
  { value: "transport", label: "Transporte" },
  { value: "leisure", label: "Lazer" },
  { value: "health", label: "Saúde" },
  { value: "education", label: "Educação" },
  { value: "shopping", label: "Compras" },
  { value: "bills", label: "Contas Fixas" },
  { value: "other", label: "Outros" },
];

const paymentOptions = [
  { value: "pix", label: "PIX" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
];

export function ReceiptReviewSheet({ isOpen, onClose, extractedData, onSave }: ReceiptReviewSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    description: extractedData.description,
    amount: extractedData.amount,
    date: extractedData.date,
    category: extractedData.category as CategoryType,
    paymentMethod: extractedData.paymentMethod as "pix" | "boleto" | "card" | "cash",
  });
  const { toast } = useToast();

  // Update form data when extractedData changes
  useEffect(() => {
    setFormData({
      description: extractedData.description,
      amount: extractedData.amount,
      date: extractedData.date,
      category: extractedData.category as CategoryType,
      paymentMethod: extractedData.paymentMethod as "pix" | "boleto" | "card" | "cash",
    });
  }, [extractedData]);

  const confidenceLevel = extractedData.confidence >= 0.8 ? "high" : extractedData.confidence >= 0.5 ? "medium" : "low";
  const confidenceText = {
    high: "Alta confiança",
    medium: "Confiança média",
    low: "Baixa confiança - revise os dados",
  };
  const confidenceColor = {
    high: "text-green-500",
    medium: "text-yellow-500",
    low: "text-destructive",
  };

  const handleSubmit = async () => {
    if (!formData.description || formData.amount <= 0) {
      toast({
        title: "Dados inválidos",
        description: "Preencha a descrição e o valor",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await addTransaction({
        description: formData.description,
        amount: -Math.abs(formData.amount), // Expenses are negative
        category: formData.category,
        payment_method: formData.paymentMethod,
        status: "paid",
        is_recurring: false,
        transaction_date: formData.date,
        notes: extractedData.establishment !== formData.description 
          ? `Estabelecimento: ${extractedData.establishment}` 
          : undefined,
      });

      toast({
        title: "Gasto adicionado!",
        description: `${formData.description} - R$ ${formData.amount.toFixed(2)}`,
      });

      onSave();
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível adicionar o gasto",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-accent" />
              Revisar Dados
            </span>
            <span className={`text-xs font-normal flex items-center gap-1 ${confidenceColor[confidenceLevel]}`}>
              {confidenceLevel === "low" && <AlertCircle className="w-3 h-3" />}
              {confidenceText[confidenceLevel]}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(90vh-10rem)] pb-4">
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Supermercado Extra"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="0,00"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value as CategoryType })}
            >
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <CategoryBadge category={formData.category} size="sm" />
                    <span>{categoryOptions.find(c => c.value === formData.category)?.label}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={option.value} size="sm" />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as "pix" | "boleto" | "card" | "cash" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items (if any) */}
          {extractedData.items && extractedData.items.length > 0 && (
            <div className="space-y-2">
              <Label>Itens Identificados</Label>
              <div className="bg-muted/50 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                {extractedData.items.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-foreground">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="text-muted-foreground">
                      R$ {item.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Establishment */}
          {extractedData.establishment && extractedData.establishment !== formData.description && (
            <div className="bg-muted/30 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Estabelecimento</p>
              <p className="text-sm text-foreground">{extractedData.establishment}</p>
            </div>
          )}
        </div>

        <SheetFooter className="pt-4 border-t border-border">
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Salvar Gasto
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
