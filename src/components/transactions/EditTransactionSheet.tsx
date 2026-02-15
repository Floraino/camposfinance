import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryBadge, categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { cn } from "@/lib/utils";
import { type Transaction, type NewTransaction, updateTransaction, deleteTransaction } from "@/services/transactionService";
import { merchantFingerprint } from "@/services/categorizationEngine";
import { setCache } from "@/services/merchantCategoryCacheService";
import { getFamilyMembers, type FamilyMember } from "@/services/familyService";
import { getHouseholdAccounts, type Account } from "@/services/householdService";
import { getCreditCards, type CreditCard } from "@/services/creditCardService";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EditTransactionSheetProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onUpdate: () => void;
  householdId: string;
}

const paymentMethods = [
  { id: "pix", label: "PIX" },
  { id: "boleto", label: "Boleto" },
  { id: "card", label: "Cartão" },
  { id: "cash", label: "Dinheiro" },
] as const;

export function EditTransactionSheet({ isOpen, transaction, onClose, onUpdate, householdId }: EditTransactionSheetProps) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<CategoryType>("other");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "card" | "cash">("pix");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [isRecurring, setIsRecurring] = useState(false);
  const [transactionDate, setTransactionDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memberId, setMemberId] = useState<string | undefined>(undefined);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && transaction) {
      setDescription(transaction.description);
      setAmount(Math.abs(transaction.amount).toString().replace(".", ","));
      setCategory(transaction.category);
      setPaymentMethod(transaction.payment_method);
      setStatus(transaction.status);
      setIsRecurring(transaction.is_recurring);
      setTransactionDate(transaction.transaction_date);
      setMemberId(transaction.member_id || undefined);
      setSelectedAccountId(transaction.account_id ?? undefined);
      setSelectedCardId(transaction.credit_card_id ?? undefined);
      setDueDate(transaction.due_date || "");
      loadFamilyMembers();
      loadAccountsAndCards();
    }
  }, [isOpen, transaction, householdId]);

  const loadFamilyMembers = async () => {
    if (!householdId) return;
    try {
      const members = await getFamilyMembers(householdId);
      setFamilyMembers(members);
    } catch (error) {
      console.error("Error loading family members:", error);
    }
  };

  const loadAccountsAndCards = async () => {
    if (!householdId) return;
    try {
      const [accs, cardList] = await Promise.all([
        getHouseholdAccounts(householdId),
        getCreditCards(householdId),
      ]);
      setAccounts(accs);
      setCards(cardList);
    } catch (error) {
      console.error("Error loading accounts/cards:", error);
    }
  };

  const handleSubmit = async () => {
    if (!description || !amount || !transaction || !householdId) return;

    setIsSaving(true);
    try {
      await updateTransaction(transaction.id, householdId, {
        description,
        amount: -Math.abs(parseFloat(amount.replace(",", "."))),
        category,
        payment_method: paymentMethod,
        status,
        is_recurring: isRecurring,
        transaction_date: transactionDate,
        due_date: status === "pending" ? (dueDate || null) : null,
        member_id: memberId,
        account_id: selectedAccountId ?? null,
        credit_card_id: paymentMethod === "card" ? (selectedCardId ?? null) : null,
      });
      try {
        const fp = merchantFingerprint(description);
        if (fp) await setCache(householdId, fp, category, 1.0);
      } catch (_) { /* cache opcional */ }
      // Invalidar saldo de contas e dados de cartões após editar transação
      queryClient.invalidateQueries({ queryKey: ["accounts", householdId] });

      toast({
        title: "Gasto atualizado!",
        description: "As alterações foram salvas com sucesso.",
      });
      
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível salvar as alterações",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction || !householdId) return;

    setIsDeleting(true);
    try {
      await deleteTransaction(transaction.id, householdId);
      
      toast({
        title: "Gasto excluído!",
        description: "O lançamento foi removido.",
      });
      
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível remover o gasto",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (!isOpen || !transaction) return null;

  return (
    <>
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
            <h2 className="text-xl font-bold text-foreground">Editar Gasto</h2>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon-sm" 
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          <div className="p-4 space-y-6 pb-safe">
            {/* Date */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Data
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="mobile-input"
              />
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
                    onClick={() => {
                      setPaymentMethod(method.id);
                      if (method.id !== "card") setSelectedCardId(undefined);
                    }}
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

            {/* Account Selection — show current and allow change */}
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
                    Família
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

            {/* Credit Card — show when payment = card and there are cards available */}
            {paymentMethod === "card" && cards.length > 0 && (
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
                  {cards.map((card) => (
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

            {/* Due Date — only when status is pending */}
            {status === "pending" && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Data de vencimento
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border-2 border-border bg-background text-foreground text-sm"
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
            </button>
            
            {/* Submit Button */}
            <Button 
              variant="accent" 
              size="lg" 
              className="w-full"
              onClick={handleSubmit}
              disabled={!description || !amount || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O gasto "{transaction.description}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
