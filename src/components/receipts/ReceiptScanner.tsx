import { useState, useRef } from "react";
import { Camera, Upload, X, Loader2, ScanLine, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProFeature } from "@/hooks/useProFeature";
import { ReceiptReviewSheet, type ExtractedReceipt } from "./ReceiptReviewSheet";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";
import { ProBadge } from "@/components/paywall/ProBadge";

interface ReceiptScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onTransactionAdded?: () => void;
  onContinueManually?: () => void;
  householdId: string;
}

export function ReceiptScanner({ isOpen, onClose, onTransactionAdded, onContinueManually, householdId }: ReceiptScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedReceipt | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { allowed: canUseOCR } = useProFeature("OCR_SCAN");

  const handleFileSelect = async (file: File) => {
    // Check if OCR is allowed (PRO only)
    if (!canUseOCR) {
      setShowUpgradeModal(true);
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem",
        variant: "destructive",
      });
      return;
    }

    // Show preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

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
          body: JSON.stringify({ imageBase64, mimeType, householdId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Handle PRO_REQUIRED error specifically
        if (data.code === "PRO_REQUIRED") {
          setShowUpgradeModal(true);
          resetScanner();
          return;
        }
        throw new Error(data.error || "Erro ao processar cupom");
      }

      setExtractedData(data);
      setShowReview(true);
    } catch (error) {
      console.error("Error scanning receipt:", error);
      toast({
        title: "Erro ao ler cupom",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
      resetScanner();
    } finally {
      setIsScanning(false);
    }
  };

  const resetScanner = () => {
    setPreviewUrl(null);
    setExtractedData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleClose = () => {
    resetScanner();
    onClose();
  };

  const handleReviewClose = () => {
    setShowReview(false);
    resetScanner();
  };

  const handleTransactionSaved = () => {
    setShowReview(false);
    resetScanner();
    onClose();
    onTransactionAdded?.();
  };

  return (
    <>
      <Sheet open={isOpen && !showReview} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-accent" />
              Escanear Cupom Fiscal
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col h-[calc(100%-4rem)]">
            {isScanning ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-48 h-48 object-cover rounded-2xl opacity-50"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-accent animate-spin" />
                  </div>
                </div>
                <p className="text-muted-foreground text-center">
                  Analisando cupom com IA...
                </p>
              </div>
            ) : previewUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-64 rounded-2xl shadow-lg"
                  />
                  <button
                    onClick={resetScanner}
                    className="absolute -top-2 -right-2 w-8 h-8 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="text-center mb-4">
                  <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                    <ScanLine className="w-12 h-12 text-accent" />
                    <ProBadge show={!canUseOCR} size="md" iconOnly className="absolute -top-1 -right-1" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Leitura Automática
                    {!canUseOCR && <span className="ml-2 text-xs text-amber-500 font-normal">PRO</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {canUseOCR 
                      ? "Tire uma foto ou selecione uma imagem do cupom fiscal para extrair os dados automaticamente"
                      : "Essa funcionalidade é do plano Pro da família. Atualize para usar o OCR automático."
                    }
                  </p>
                </div>

                <div className="flex gap-4 w-full max-w-xs">
                  <Button
                    variant="outline"
                    className={`flex-1 h-24 flex-col gap-2 ${!canUseOCR ? 'opacity-60' : ''}`}
                    onClick={() => canUseOCR ? cameraInputRef.current?.click() : setShowUpgradeModal(true)}
                  >
                    <Camera className="w-6 h-6" />
                    <span className="text-xs">Câmera</span>
                  </Button>
                  <Button
                    variant="outline"
                    className={`flex-1 h-24 flex-col gap-2 ${!canUseOCR ? 'opacity-60' : ''}`}
                    onClick={() => canUseOCR ? fileInputRef.current?.click() : setShowUpgradeModal(true)}
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-xs">Galeria</span>
                  </Button>
                </div>

                {!canUseOCR && (
                  <Button 
                    className="w-full max-w-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                    onClick={() => setShowUpgradeModal(true)}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Ativar Pro para a Família
                  </Button>
                )}

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
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                {canUseOCR 
                  ? "Suporta cupom fiscal, nota fiscal e comprovantes PIX/cartão"
                  : "Família no plano Basic - OCR desabilitado"
                }
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {extractedData && (
        <ReceiptReviewSheet
          isOpen={showReview}
          onClose={handleReviewClose}
          extractedData={extractedData}
          onSave={handleTransactionSaved}
          householdId={householdId}
        />
      )}

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="ocr"
        onContinueManually={onContinueManually ? () => {
          setShowUpgradeModal(false);
          onClose();
          onContinueManually();
        } : undefined}
      />
    </>
  );
}
