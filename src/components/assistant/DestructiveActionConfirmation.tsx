import { useState } from "react";
import { AlertTriangle, Trash2, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface DestructiveActionPreview {
  actionType: "delete_transactions" | "delete_account" | "delete_family" | "reset_data";
  count: number;
  transactionIds: string[];
  householdName: string;
  householdId: string;
  rangeLabel?: string;
  category?: string;
  sumAmount?: number;
  topCategories?: { name: string; count: number }[];
}

interface DestructiveActionConfirmationProps {
  preview: DestructiveActionPreview | null;
  onConfirm: (preview: DestructiveActionPreview) => void;
  onCancel: () => void;
  isOpen: boolean;
}

type ConfirmationStep = "preview" | "type_confirm";

export function DestructiveActionConfirmation({
  preview,
  onConfirm,
  onCancel,
  isOpen,
}: DestructiveActionConfirmationProps) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState<ConfirmationStep>("preview");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");

  const expectedText = preview ? `APAGAR ${preview.count}` : "";

  const handleContinue = () => {
    setStep("type_confirm");
    setConfirmText("");
    setError("");
  };

  const handleFinalConfirm = () => {
    if (confirmText.trim().toUpperCase() === expectedText) {
      setStep("preview");
      setConfirmText("");
      setError("");
      if (preview) onConfirm(preview);
    } else {
      setError(`Texto incorreto. Digite exatamente: ${expectedText}`);
    }
  };

  const handleClose = () => {
    setStep("preview");
    setConfirmText("");
    setError("");
    onCancel();
  };

  if (!preview) return null;

  const actionLabels: Record<string, string> = {
    delete_transactions: "Apagar Lançamentos",
    delete_account: "Apagar Conta",
    delete_family: "Apagar Família",
    reset_data: "Resetar Dados",
  };

  const PreviewContent = () => (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-full bg-destructive/10">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-foreground">
            {actionLabels[preview.actionType]}
          </h3>
          <p className="text-sm text-muted-foreground">
            Ação destrutiva detectada
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Família</span>
          <span className="font-medium text-foreground">{preview.householdName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Quantidade</span>
          <span className="font-bold text-destructive">{preview.count} lançamentos</span>
        </div>
        {preview.rangeLabel && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Período</span>
            <span className="font-medium text-foreground">{preview.rangeLabel}</span>
          </div>
        )}
        {preview.sumAmount !== undefined && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Valor total</span>
            <span className="font-medium text-foreground">
              R$ {Math.abs(preview.sumAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {preview.topCategories && preview.topCategories.length > 0 && (
          <div className="pt-2 border-t border-border">
            <span className="text-muted-foreground text-sm">Categorias afetadas:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {preview.topCategories.slice(0, 3).map((cat) => (
                <span
                  key={cat.name}
                  className="px-2 py-0.5 bg-muted rounded text-xs text-muted-foreground"
                >
                  {cat.name} ({cat.count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mt-4">
        <Shield className="w-4 h-4 text-destructive flex-shrink-0" />
        <p className="text-sm text-destructive">
          Esta ação <strong>não pode ser desfeita</strong>. Os dados serão permanentemente removidos.
        </p>
      </div>
    </>
  );

  const TypeConfirmContent = () => (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-full bg-destructive/10">
          <Trash2 className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-foreground">
            Confirmação Final
          </h3>
          <p className="text-sm text-muted-foreground">
            Modo de Segurança Ativo
          </p>
        </div>
      </div>

      <p className="text-foreground mb-4">
        Para apagar <strong>{preview.count} lançamentos</strong> da família{" "}
        <strong>{preview.householdName}</strong>, digite exatamente:
      </p>

      <div className="p-3 rounded-lg bg-muted text-center mb-4">
        <code className="text-lg font-mono font-bold text-destructive">
          {expectedText}
        </code>
      </div>

      <Input
        value={confirmText}
        onChange={(e) => {
          setConfirmText(e.target.value);
          setError("");
        }}
        placeholder={`Digite: ${expectedText}`}
        className={cn(
          "text-center font-mono text-lg",
          error && "border-destructive focus-visible:ring-destructive"
        )}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleFinalConfirm();
        }}
      />

      {error && (
        <p className="text-sm text-destructive mt-2 text-center">{error}</p>
      )}
    </>
  );

  const FooterButtons = () => (
    <div className="flex gap-3 w-full">
      <Button
        variant="outline"
        onClick={handleClose}
        className="flex-1"
      >
        <X className="w-4 h-4 mr-2" />
        Cancelar
      </Button>
      {step === "preview" ? (
        <Button
          variant="destructive"
          onClick={handleContinue}
          className="flex-1"
        >
          Continuar
        </Button>
      ) : (
        <Button
          variant="destructive"
          onClick={handleFinalConfirm}
          disabled={confirmText.trim().toUpperCase() !== expectedText}
          className="flex-1"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Apagar
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="sr-only">Confirmação de Ação Destrutiva</DrawerTitle>
            <DrawerDescription className="sr-only">
              Confirme a exclusão de dados
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            {step === "preview" ? <PreviewContent /> : <TypeConfirmContent />}
          </div>
          <DrawerFooter>
            <FooterButtons />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="sr-only">
            Confirmação de Ação Destrutiva
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Confirme a exclusão de dados
          </AlertDialogDescription>
        </AlertDialogHeader>
        {step === "preview" ? <PreviewContent /> : <TypeConfirmContent />}
        <AlertDialogFooter>
          <FooterButtons />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
