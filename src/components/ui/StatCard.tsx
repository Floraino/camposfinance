import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number; // percentual de variação
  icon?: LucideIcon;
  variant?: "default" | "income" | "expense" | "balance";
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  variant = "default",
  className,
}: StatCardProps) {
  const variantStyles = {
    default: "bg-card border-border",
    income: "bg-success/10 border-success/20",
    expense: "bg-destructive/10 border-destructive/20",
    balance: "bg-primary/10 border-primary/20",
  };

  const valueStyles = {
    default: "text-foreground",
    income: "text-success",
    expense: "text-destructive",
    balance: "text-primary",
  };

  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) return Minus;
    return trend > 0 ? TrendingUp : TrendingDown;
  };

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return "text-muted-foreground";
    // Para gastos, aumento é ruim (vermelho), diminuição é bom (verde)
    if (variant === "expense") {
      return trend > 0 ? "text-destructive" : "text-success";
    }
    // Para receitas e saldo, aumento é bom (verde)
    return trend > 0 ? "text-success" : "text-destructive";
  };

  const TrendIcon = getTrendIcon();

  return (
    <div
      className={cn(
        "stat-card border",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        {Icon && (
          <div className={cn("p-2 rounded-lg", variantStyles[variant])}>
            <Icon className={cn("w-4 h-4", valueStyles[variant])} />
          </div>
        )}
      </div>
      
      <p className={cn("text-2xl font-bold", valueStyles[variant])}>
        {value}
      </p>
      
      {(subtitle || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-2">
          {trend !== undefined && (
            <div className={cn("flex items-center gap-1", getTrendColor())}>
              <TrendIcon className="w-3 h-3" />
              <span className="text-xs font-medium">
                {Math.abs(trend)}%
              </span>
            </div>
          )}
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
