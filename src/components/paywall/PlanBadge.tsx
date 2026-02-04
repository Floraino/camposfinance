import { Crown } from "lucide-react";
import { useHousehold } from "@/hooks/useHousehold";
import { cn } from "@/lib/utils";

interface PlanBadgeProps {
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PlanBadge({ showLabel = true, size = "md", className }: PlanBadgeProps) {
  const { planType } = useHousehold();
  const isPro = planType === "PRO";

  const sizeClasses = {
    sm: "h-5 text-xs px-1.5",
    md: "h-6 text-xs px-2",
    lg: "h-8 text-sm px-3",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        sizeClasses[size],
        isPro
          ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      {isPro && <Crown className={iconSizes[size]} />}
      {showLabel && <span>{isPro ? "PRO" : "BASIC"}</span>}
    </div>
  );
}
