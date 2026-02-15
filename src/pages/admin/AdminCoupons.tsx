import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAdminCoupons, createCoupon, deactivateCoupon, generateCouponCode, AdminCoupon } from "@/services/adminService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { 
  ArrowLeft, Ticket, Plus, Copy, Check, 
  Loader2, XCircle, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<AdminCoupon | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Form state
  const [newCode, setNewCode] = useState("");
  const [newDays, setNewDays] = useState("30");
  const [newMaxRedemptions, setNewMaxRedemptions] = useState("100");
  const [newNotes, setNewNotes] = useState("");
  
  const { toast } = useToast();

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const data = await getAdminCoupons();
      setCoupons(data);
    } catch (error) {
      console.error("Error loading coupons:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCode = () => {
    setNewCode(generateCouponCode());
  };

  const handleCreateCoupon = async () => {
    if (!newCode.trim()) {
      toast({ title: "Erro", description: "Digite um código", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      await createCoupon({
        code: newCode,
        days_granted: parseInt(newDays),
        max_redemptions: parseInt(newMaxRedemptions),
        notes: newNotes || undefined,
      });
      toast({ title: "Cupom criado!", description: `Código: ${newCode}` });
      // Reload list after creation
      const freshData = await getAdminCoupons();
      setCoupons(freshData);
      setShowCreate(false);
      resetForm();
    } catch (error: any) {
      console.error("Error creating coupon:", error);
      toast({ 
        title: "Erro", 
        description: error.message?.includes("duplicate") ? "Código já existe" : "Falha ao criar cupom", 
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedCoupon) return;
    
    setIsProcessing(true);
    try {
      await deactivateCoupon(selectedCoupon.id);
      toast({ title: "Cupom desativado" });
      // Reload list after deactivation
      const freshData = await getAdminCoupons();
      setCoupons(freshData);
      setShowConfirmDeactivate(false);
      setSelectedCoupon(null);
    } catch (error) {
      console.error("Error deactivating coupon:", error);
      toast({ title: "Erro", description: "Falha ao desativar", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: "Código copiado!" });
  };

  const resetForm = () => {
    setNewCode("");
    setNewDays("30");
    setNewMaxRedemptions("100");
    setNewNotes("");
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Sem expiração";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="admin-header-safe bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-bold">Cupons</h1>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Novo
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-8">
            <Ticket className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum cupom criado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {coupons.map((coupon) => (
              <Card
                key={coupon.id}
                className={`p-4 ${!coupon.is_active ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-mono font-bold">{coupon.code}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyCode(coupon.code)}
                    >
                      {copiedCode === coupon.code ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      coupon.is_active 
                        ? "bg-accent/20 text-accent" 
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {coupon.is_active ? "Ativo" : "Inativo"}
                    </span>
                    {coupon.is_active && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setSelectedCoupon(coupon);
                          setShowConfirmDeactivate(true);
                        }}
                      >
                        <XCircle className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Dias Pro</p>
                    <p className="font-medium">{coupon.days_granted}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Resgates</p>
                    <p className="font-medium">{coupon.redeemed_count}/{coupon.max_redemptions}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expira</p>
                    <p className="font-medium">{formatDate(coupon.expires_at)}</p>
                  </div>
                </div>

                {coupon.notes && (
                  <p className="text-xs text-muted-foreground mt-2 italic">{coupon.notes}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="bottom" className="h-auto rounded-t-3xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Criar Cupom</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Código</label>
              <div className="flex gap-2">
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Ex: PROMO30"
                  maxLength={20}
                  className="font-mono uppercase"
                />
                <Button variant="outline" size="icon" onClick={handleGenerateCode}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Dias de Pro</label>
              <Input
                type="number"
                value={newDays}
                onChange={(e) => setNewDays(e.target.value)}
                min="1"
                max="365"
              />
              <div className="flex gap-2 mt-2">
                {[7, 30, 90, 180].map((days) => (
                  <Button
                    key={days}
                    variant="outline"
                    size="sm"
                    onClick={() => setNewDays(String(days))}
                    className={newDays === String(days) ? "border-primary" : ""}
                  >
                    {days}d
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Limite de Resgates</label>
              <Input
                type="number"
                value={newMaxRedemptions}
                onChange={(e) => setNewMaxRedemptions(e.target.value)}
                min="1"
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Notas (opcional)</label>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Ex: Campanha de lançamento"
              />
            </div>

            <Button
              variant="accent"
              className="w-full"
              onClick={handleCreateCoupon}
              disabled={isProcessing || !newCode.trim()}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Cupom"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm Deactivate Dialog */}
      <AlertDialog open={showConfirmDeactivate} onOpenChange={setShowConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar cupom?</AlertDialogTitle>
            <AlertDialogDescription>
              O cupom "{selectedCoupon?.code}" não poderá mais ser resgatado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
