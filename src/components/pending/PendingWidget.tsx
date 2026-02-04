import { useState, useEffect } from "react";
import { AlertCircle, ChevronRight, Loader2, Tag, Copy, Users, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { getAllPendingItems, type PendingSummary } from "@/services/pendingItemsService";

interface PendingWidgetProps {
  householdId: string;
  className?: string;
}

const typeIcons = {
  uncategorized: Tag,
  duplicate: Copy,
  pending_split: Users,
  pro_expiring: Crown,
};

const typeLabels: Record<string, string> = {
  uncategorized: "Sem categoria",
  duplicate: "Duplicatas",
  pending_split: "Splits pendentes",
  pro_expiring: "PRO expirando",
};

export function PendingWidget({ householdId, className }: PendingWidgetProps) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (householdId) {
      loadPending();
    }
  }, [householdId]);

  const loadPending = async () => {
    try {
      const data = await getAllPendingItems(householdId);
      setSummary(data);
    } catch (error) {
      console.error("Error loading pending items:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <button className={cn("w-full glass-card p-4 flex items-center gap-4", className)}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Verificando pendências...</span>
      </button>
    );
  }

  if (!summary || summary.total === 0) {
    return null;
  }

  const mainTypes = Object.entries(summary.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  return (
    <button
      onClick={() => navigate("/pending")}
      className={cn(
        "w-full glass-card p-4 flex items-center gap-4 touch-feedback",
        "border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-amber-500/10",
        className
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 relative">
        <AlertCircle className="w-6 h-6 text-amber-500" />
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-amber-50 text-xs font-bold flex items-center justify-center">
          {summary.total > 9 ? "9+" : summary.total}
        </span>
      </div>

      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {summary.total} pendência{summary.total !== 1 ? "s" : ""} para revisar
        </p>
        <div className="flex items-center gap-2 mt-1">
          {mainTypes.map(([type, count]) => {
            const Icon = typeIcons[type as keyof typeof typeIcons] || AlertCircle;
            return (
              <span
                key={type}
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Icon className="w-3 h-3" />
                {count} {typeLabels[type] || type}
              </span>
            );
          })}
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
    </button>
  );
}
