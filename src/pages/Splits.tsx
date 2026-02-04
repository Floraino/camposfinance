import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Plus, Split, RefreshCw, ArrowLeft } from "lucide-react";
import { useHousehold } from "@/hooks/useHousehold";
import { getSplitEvents, type SplitEvent } from "@/services/splitService";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { SplitCard } from "@/components/splits/SplitCard";
import { CreateSplitSheet } from "@/components/splits/CreateSplitSheet";
import { SplitDetailSheet } from "@/components/splits/SplitDetailSheet";
import { useNavigate } from "react-router-dom";

export default function Splits() {
  const navigate = useNavigate();
  const { currentHousehold, isAdmin } = useHousehold();
  const { toast } = useToast();
  
  const [splits, setSplits] = useState<SplitEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);

  const loadSplits = async () => {
    if (!currentHousehold) return;
    
    try {
      const data = await getSplitEvents(currentHousehold.id);
      setSplits(data);
    } catch (error) {
      console.error("Error loading splits:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os rateios",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSplits();
  }, [currentHousehold?.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSplits();
  };

  const handleSplitCreated = () => {
    setCreateSheetOpen(false);
    loadSplits();
  };

  const handleSplitUpdated = () => {
    loadSplits();
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-4">
          <header className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold">Rateios</h1>
          </header>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 pb-24">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold">Rateios</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </header>

        {/* Header with create button */}
        {isAdmin && (
          <Button 
            onClick={() => setCreateSheetOpen(true)} 
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Rateio
          </Button>
        )}

        {/* Empty state */}
        {splits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Split className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Nenhum rateio</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              {isAdmin 
                ? "Crie um rateio para dividir despesas de viagens ou eventos com outras famílias."
                : "Nenhum rateio disponível para visualização."}
            </p>
          </div>
        )}

        {/* Splits list */}
        <div className="space-y-3">
          {splits.map((split) => (
            <SplitCard
              key={split.id}
              split={split}
              onClick={() => setSelectedSplitId(split.id)}
            />
          ))}
        </div>
      </div>

      {/* Create Split Sheet */}
      <CreateSplitSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        onCreated={handleSplitCreated}
      />

      {/* Split Detail Sheet */}
      <SplitDetailSheet
        splitId={selectedSplitId}
        open={!!selectedSplitId}
        onOpenChange={(open) => !open && setSelectedSplitId(null)}
        onUpdated={handleSplitUpdated}
      />
    </MobileLayout>
  );
}
