import { useState } from "react";
import { Plus, X, Wallet, CreditCard, Building2, PiggyBank, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import { canCreateAccount } from "@/services/planService";
import { createAccount, getHouseholdAccounts, deleteAccount, type Account } from "@/services/householdService";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AccountsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const accountIcons = {
  wallet: Wallet,
  credit: CreditCard,
  bank: Building2,
  savings: PiggyBank,
};

const accountColors = [
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#F97316", // Orange
  "#10B981", // Emerald
  "#3B82F6", // Blue
];

export function AccountsSheet({ isOpen, onClose }: AccountsSheetProps) {
  const { currentHousehold, planType } = useHousehold();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("wallet");
  const [newAccountColor, setNewAccountColor] = useState(accountColors[0]);
  const [isCreating, setIsCreating] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts", currentHousehold?.id],
    queryFn: () => currentHousehold ? getHouseholdAccounts(currentHousehold.id) : Promise.resolve([]),
    enabled: !!currentHousehold,
  });

  const handleCreateAccount = async () => {
    if (!currentHousehold || !newAccountName.trim()) return;

    // Check if can create account
    const { allowed, currentCount, maxCount } = await canCreateAccount(currentHousehold.id);
    
    if (!allowed) {
      setShowUpgradeModal(true);
      return;
    }

    setIsCreating(true);

    try {
      await createAccount(currentHousehold.id, {
        name: newAccountName,
        type: newAccountType,
        color: newAccountColor,
        icon: newAccountType,
      });

      toast({
        title: "Conta criada!",
        description: `${newAccountName} foi adicionada.`,
      });

      queryClient.invalidateQueries({ queryKey: ["accounts", currentHousehold.id] });
      setShowNewAccount(false);
      setNewAccountName("");
    } catch (error) {
      console.error("Error creating account:", error);
      toast({
        title: "Erro ao criar conta",
        description: "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAccount = async (account: Account) => {
    if (!currentHousehold || !confirm(`Tem certeza que deseja excluir "${account.name}"?`)) return;

    try {
      await deleteAccount(account.id, currentHousehold.id);
      toast({
        title: "Conta excluída",
        description: `${account.name} foi removida.`,
      });
      queryClient.invalidateQueries({ queryKey: ["accounts", currentHousehold?.id] });
    } catch (error) {
      console.error("Error deleting account:", error);
      toast({
        title: "Erro ao excluir",
        description: "Tente novamente",
        variant: "destructive",
      });
    }
  };

  const maxAccounts = planType === "PRO" ? Infinity : 2;
  const canAddMore = planType === "PRO" || accounts.length < maxAccounts;

  const getIconComponent = (iconType: string) => {
    return accountIcons[iconType as keyof typeof accountIcons] || Wallet;
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-accent" />
                Contas
              </div>
              <span className="text-sm font-normal text-muted-foreground">
                {accounts.length}/{maxAccounts === Infinity ? "∞" : maxAccounts}
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="overflow-y-auto h-[calc(100%-4rem)] pb-safe">
            <div className="py-4 space-y-4">
              {/* Account limit warning for BASIC */}
              {planType === "BASIC" && accounts.length >= 1 && (
                <div className="glass-card p-3 border-amber-500/30 flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Famílias no plano Basic podem ter até {maxAccounts} contas.
                    {accounts.length >= maxAccounts && " Atualize para Pro para criar mais."}
                  </p>
                </div>
              )}

              {/* Accounts list */}
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-12">
                  <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">Nenhuma conta cadastrada</p>
                  <p className="text-sm text-muted-foreground">Crie sua primeira conta abaixo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => {
                    const IconComponent = getIconComponent(account.icon);
                    return (
                      <div
                        key={account.id}
                        className="glass-card p-4 flex items-center gap-3"
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${account.color}20` }}
                        >
                          <IconComponent
                            className="w-5 h-5"
                            style={{ color: account.color }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{account.name}</p>
                          <p className="text-sm text-muted-foreground">
                            R$ {account.balance.toFixed(2).replace(".", ",")}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteAccount(account)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New account form */}
              {showNewAccount ? (
                <div className="glass-card p-4 space-y-4">
                  <h4 className="font-medium text-foreground">Nova Conta</h4>
                  
                  <input
                    type="text"
                    placeholder="Nome da conta (ex: Nubank)"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="mobile-input"
                  />

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Tipo</label>
                    <div className="flex gap-2">
                      {Object.entries(accountIcons).map(([type, Icon]) => (
                        <button
                          key={type}
                          onClick={() => setNewAccountType(type)}
                          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            newAccountType === type
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Cor</label>
                    <div className="flex gap-2">
                      {accountColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewAccountColor(color)}
                          className={`w-8 h-8 rounded-full transition-transform ${
                            newAccountColor === color ? "scale-110 ring-2 ring-foreground" : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowNewAccount(false);
                        setNewAccountName("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="accent"
                      className="flex-1"
                      onClick={handleCreateAccount}
                      disabled={isCreating || !newAccountName.trim()}
                    >
                      {isCreating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Criar"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => canAddMore ? setShowNewAccount(true) : setShowUpgradeModal(true)}
                >
                  {canAddMore ? (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Conta
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4 mr-2 text-amber-500" />
                      Criar mais contas (Pro)
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="accounts"
      />
    </>
  );
}
