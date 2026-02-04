import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProBadgeProps {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show the badge (typically !canUseOCR or planType === "BASIC") */
  show?: boolean;
  /** Additional class names */
  className?: string;
  /** Whether to show just the icon */
  iconOnly?: boolean;
  /** Custom label (default: "PRO") */
  label?: string;
}

/**
 * Standardized PRO badge component
 * 
 * Use this badge on all PRO features to indicate they require upgrade.
 * The badge should be shown when the family is on the BASIC plan.
 * 
 * @example
 * ```tsx
 * // In a button
 * <Button>
 *   Escanear Cupom
 *   <ProBadge show={planType === "BASIC"} />
 * </Button>
 * 
 * // Absolute positioned
 * <div className="relative">
 *   <Button>Escanear</Button>
 *   <ProBadge show={!allowed} className="absolute -top-2 -right-2" />
 * </div>
 * ```
 */
export function ProBadge({ 
  size = "sm", 
  show = true, 
  className,
  iconOnly = false,
  label = "PRO"
}: ProBadgeProps) {
  if (!show) return null;

  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-2.5 py-1",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full font-semibold",
        "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
        "shadow-sm",
        sizeClasses[size],
        className
      )}
    >
      <Crown className={iconSizes[size]} />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}

/**
 * PRO badge for cards/list items - positioned absolutely in top-right
 */
export function ProBadgeCorner({ show = true }: { show?: boolean }) {
  if (!show) return null;
  
  return (
    <ProBadge 
      show={show} 
      size="sm"
      className="absolute -top-2 -right-2 z-10"
    />
  );
}

/**
 * PRO indicator for inline text
 */
export function ProIndicator({ show = true }: { show?: boolean }) {
  if (!show) return null;
  
  return (
    <span className="ml-1.5 text-xs text-amber-500 font-medium">PRO</span>
  );
}
