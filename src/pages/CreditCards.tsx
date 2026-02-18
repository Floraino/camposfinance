import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import {
  getCreditCards,
  createCreditCard,
  deleteCreditCard,
  getCardStatement,
  getCardStatementTransactions,
  type CreditCard,
  type NewCreditCard,
  type CardStatement,
} from "@/services/creditCardService";
import { type Transaction } from "@/services/transactionService";
import type { CategoryType } from "@/components/ui/CategoryBadge";
import {
  getInstallmentGroups,
  cancelInstallment,
  type InstallmentGroup,
} from "@/services/installmentService";
import { EditTransactionSheet } from "@/components/transactions/EditTransactionSheet";
import {
  Loader2,
  Plus,
  CreditCard as CreditCardIcon,
  ChevronRight,
  Calendar,
  Trash2,
  Package,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function CreditCards() {
  const { currentHousehold, isLoading: householdLoading } = useHousehold();
  const { toast } = useToast();

  const [cards, setCards] = useState<CreditCard[]>([]);
  const [statements, setStatements] = useState<Record<string, CardStatement>>({});
  const [cardTransactions, setCardTransactions] = useState<Record<string, Transaction[]>>({});
  const [installments, setInstallments] = useState<InstallmentGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [cancelGroupId, setCancelGroupId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showEditSheet, setShowEditSheet] = useState(false);

  // Add form state
  const [formName, setFormName] = useState("");
  const [formLastFour, setFormLastFour] = useState("");
  const [formClosingDay, setFormClosingDay] = useState("10");
  const [formDueDay, setFormDueDay] = useState("20");
  const [formLimit, setFormLimit] = useState("");
  const [formColor, setFormColor] = useState("#6366F1");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentHousehold?.id) loadData();
  }, [currentHousehold?.id]);

  // Refetch ao voltar para a aba (ex.: usuário adicionou gasto de cartão em Gastos)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && currentHousehold?.id) loadData();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [currentHousehold?.id]);

  const loadData = async () => {
    if (!currentHousehold?.id) return;
    setIsLoading(true);
    try {
      const [cardsData, installmentsData] = await Promise.all([
        getCreditCards(currentHousehold.id),
        getInstallmentGroups(currentHousehold.id),
      ]);
      setCards(cardsData);
      setInstallments(installmentsData);

      // Mesma fonte que Gastos: tabela transactions, filtrada por credit_card_id e ciclo da fatura
      const month = getCurrentMonth();
      const stmts: Record<string, CardStatement> = {};
      const txByCard: Record<string, Transaction[]> = {};
      for (const card of cardsData) {
        try {
          stmts[card.id] = await getCardStatement(currentHousehold.id, card.id, card, month);
          const raw = await getCardStatementTransactions(currentHousehold.id, card.id, card, month);
          txByCard[card.id] = (raw || []).map((t: any) => ({
            ...t,
            category: t.category as CategoryType,
            status: t.status as "paid" | "pending",
            member_name: (t.family_members as { name: string } | null)?.name,
          })) as Transaction[];
        } catch (_e) {
          txByCard[card.id] = [];
        }
      }
      setStatements(stmts);
      setCardTransactions(txByCard);
    } catch (err) {
      console.error("[creditCards] load error:", err);
      toast({ title: "Erro ao carregar cartões", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!currentHousehold?.id || !formName || !formClosingDay || !formDueDay) return;
    setIsSaving(true);
    try {
      await createCreditCard(currentHousehold.id, {
        name: formName,
        last_four: formLastFour || undefined,
        closing_day: parseInt(formClosingDay),
        due_day: parseInt(formDueDay),
        credit_limit: formLimit ? parseFloat(formLimit.replace(",", ".")) : 0,
        color: formColor,
      });
      toast({ title: "Cartão adicionado" });
      setShowAddForm(false);
      resetForm();
      await loadData();
    } catch (err) {
      toast({ title: "Erro ao adicionar cartão", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCard = async () => {
    if (!currentHousehold?.id || !deleteCardId) return;
    try {
      await deleteCreditCard(deleteCardId, currentHousehold.id);
      toast({ title: "Cartão removido" });
      setDeleteCardId(null);
      await loadData();
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const handleCancelInstallment = async () => {
    if (!currentHousehold?.id || !cancelGroupId) return;
    try {
      const count = await cancelInstallment(currentHousehold.id, cancelGroupId);
      toast({ title: `Parcelamento cancelado`, description: `${count} parcela(s) futura(s) removida(s)` });
      setCancelGroupId(null);
      await loadData();
    } catch {
      toast({ title: "Erro ao cancelar", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormLastFour("");
    setFormClosingDay("10");
    setFormDueDay("20");
    setFormLimit("");
    setFormColor("#6366F1");
  };

  const colors = ["#6366F1", "#EC4899", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EF4444", "#14B8A6"];

  if (householdLoading || isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-4 pt-safe pb-24">
        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cartões de Crédito</h1>
            <p className="text-sm text-muted-foreground">
              {cards.length} cartão(ões) cadastrado(s)
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </header>

        {/* Add Card Form */}
        {showAddForm && (
          <Card className="mb-4 border-2 border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Novo Cartão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                type="text"
                placeholder="Nome do cartão (ex: Nubank)"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground focus:border-primary outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="4 últimos dígitos"
                  value={formLastFour}
                  onChange={(e) => setFormLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="h-11 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground focus:border-primary outline-none"
                />
                <input
                  type="text"
                  placeholder="Limite (R$)"
                  value={formLimit}
                  onChange={(e) => setFormLimit(e.target.value)}
                  className="h-11 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground focus:border-primary outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Dia fechamento</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={formClosingDay}
                    onChange={(e) => setFormClosingDay(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Dia vencimento</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={formDueDay}
                    onChange={(e) => setFormDueDay(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border-2 border-border bg-muted/50 text-foreground focus:border-primary outline-none"
                  />
                </div>
              </div>
              {/* Color picker */}
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      formColor === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowAddForm(false); resetForm(); }}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleAddCard} disabled={!formName || isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cards List */}
        <div className="space-y-3 mb-6">
          {cards.length === 0 && !showAddForm && (
            <div className="text-center py-12">
              <CreditCardIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum cartão cadastrado.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddForm(true)}>
                Adicionar cartão
              </Button>
            </div>
          )}

          {cards.map((card) => {
            const stmt = statements[card.id];
            return (
              <Card key={card.id} className="border-2 overflow-hidden">
                <div className="h-2" style={{ backgroundColor: card.color }} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${card.color}20` }}
                      >
                        <CreditCardIcon className="w-5 h-5" style={{ color: card.color }} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{card.name}</CardTitle>
                        <CardDescription>
                          {card.last_four ? `•••• ${card.last_four}` : "Cartão de crédito"}
                          {card.credit_limit > 0 && ` • Limite ${formatCurrency(card.credit_limit)}`}
                        </CardDescription>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteCardId(card.id)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      Fecha dia {card.closing_day}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      Vence dia {card.due_day}
                    </span>
                  </div>
                  {stmt && (
                    <div className="mt-3 p-3 rounded-xl bg-muted/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Fatura atual</p>
                        <p className="text-lg font-bold text-foreground">
                          {formatCurrency(stmt.totalAmount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {stmt.transactionCount} lançamento(s)
                          {stmt.isClosed ? " • Fechada" : " • Aberta"}
                        </p>
                      </div>
                      <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        stmt.isPaid
                          ? "bg-success/10 text-success"
                          : stmt.isClosed
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-500/10 text-amber-600"
                      )}>
                        {stmt.isPaid ? "Paga" : stmt.isClosed ? "A pagar" : "Em aberto"}
                      </span>
                    </div>
                  )}
                  {/* Lista de lançamentos (mesmos registros que em Gastos, filtrados por cartão/fatura) */}
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Lançamentos na fatura</p>
                    {(cardTransactions[card.id]?.length ?? 0) > 0 ? (
                      <ul className="space-y-2 max-h-48 overflow-y-auto">
                        {(cardTransactions[card.id] || []).map((tx) => (
                          <li key={tx.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTransaction(tx);
                                setShowEditSheet(true);
                              }}
                              className="w-full flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0 text-left hover:bg-muted/50 rounded px-1 -mx-1"
                            >
                              <span className="truncate flex-1 text-foreground">{tx.description}</span>
                              <span className="text-destructive font-medium shrink-0 ml-2">
                                {formatCurrency(Math.abs(tx.amount))}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                {tx.transaction_date ? new Date(tx.transaction_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">Nenhum lançamento na fatura atual.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Installments Section */}
        {installments.length > 0 && (
          <>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Parcelamentos
            </h2>
            <div className="space-y-3">
              {installments.map((group) => {
                const card = cards.find((c) => c.id === group.credit_card_id);
                return (
                  <Card key={group.id} className="border">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">{group.description}</CardTitle>
                          <CardDescription>
                            {group.installment_count}x de {formatCurrency(group.total_amount / group.installment_count)}
                            {card && ` • ${card.name}`}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-medium px-2 py-1 rounded-full",
                            group.status === "active"
                              ? "bg-primary/10 text-primary"
                              : group.status === "cancelled"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-success/10 text-success"
                          )}>
                            {group.status === "active" ? "Ativo" : group.status === "cancelled" ? "Cancelado" : "Concluído"}
                          </span>
                          {group.status === "active" && (
                            <Button variant="ghost" size="icon" onClick={() => setCancelGroupId(group.id)}>
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Total: {formatCurrency(group.total_amount)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Editar gasto (mesmo fluxo da aba Gastos) */}
      {currentHousehold?.id && (
        <EditTransactionSheet
          isOpen={showEditSheet}
          transaction={selectedTransaction}
          onClose={() => {
            setShowEditSheet(false);
            setSelectedTransaction(null);
          }}
          onUpdate={() => loadData()}
          householdId={currentHousehold.id}
        />
      )}

      {/* Delete Card Dialog */}
      <AlertDialog open={!!deleteCardId} onOpenChange={() => setDeleteCardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cartão?</AlertDialogTitle>
            <AlertDialogDescription>
              O cartão será desativado. As transações vinculadas não serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCard} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Installment Dialog */}
      <AlertDialog open={!!cancelGroupId} onOpenChange={() => setCancelGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar parcelamento?</AlertDialogTitle>
            <AlertDialogDescription>
              As parcelas futuras pendentes serão removidas. Parcelas já pagas permanecerão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelInstallment} className="bg-destructive text-destructive-foreground">
              Cancelar parcelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
