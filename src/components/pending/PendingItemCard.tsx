import { 
  Tag, 
  Copy, 
  Users, 
  Crown, 
  AlertTriangle,
  ChevronRight,
  Loader2,
  Sparkles,
  Trash2,
  Plus,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PendingItem } from "@/services/pendingItemsService";

interface PendingItemCardProps {
  item: PendingItem;
  onAction: (action: string) => void;
  isProcessing: boolean;
  processingAction?: string;
}

const iconMap = {
  uncategorized: Tag,
  duplicate: Copy,
  pending_split: Users,
  pro_expiring: Crown,
  no_account: AlertTriangle,
};

const severityConfig = {
  info: {
    card: "border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10",
    icon: "bg-blue-500/20 text-blue-500",
    badge: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  },
  warning: {
    card: "border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10",
    icon: "bg-amber-500/20 text-amber-500",
    badge: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  },
  error: {
    card: "border-destructive/30 bg-gradient-to-br from-destructive/5 to-destructive/10",
    icon: "bg-destructive/20 text-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const actionIcons: Record<string, React.ElementType> = {
  categorize_all: Sparkles,
  view_uncategorized: Eye,
  review_duplicates: Trash2,
  create_rule: Plus,
  view_split: Eye,
  remind_split: Users,
  renew_pro: Crown,
};

export function PendingItemCard({ item, onAction, isProcessing, processingAction }: PendingItemCardProps) {
  const Icon = iconMap[item.type as keyof typeof iconMap] || AlertTriangle;
  const config = severityConfig[item.severity];

  return (
    <Card className={cn("border-2 transition-all duration-200 hover:shadow-lg", config.card)}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm",
            config.icon
          )}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-lg leading-tight">{item.title}</CardTitle>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide",
                config.badge
              )}>
                {item.severity === "error" ? "Urgente" : item.severity === "warning" ? "Atenção" : "Info"}
              </span>
            </div>
            <CardDescription className="text-sm">{item.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      
      {item.actions && item.actions.length > 0 && (
        <CardContent className="pt-0">
          <div className="flex gap-2 flex-wrap">
            {item.actions.map((action, idx) => {
              const ActionIcon = actionIcons[action.action.split(":")[0]] || ChevronRight;
              const isCurrentlyProcessing = isProcessing && processingAction === action.action;
              
              return (
                <Button
                  key={idx}
                  size="sm"
                  variant={action.variant === "destructive" ? "destructive" : idx === 0 ? "default" : "outline"}
                  onClick={() => onAction(action.action)}
                  disabled={isProcessing}
                  className="gap-2 shadow-sm"
                >
                  {isCurrentlyProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ActionIcon className="w-4 h-4" />
                  )}
                  {action.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
