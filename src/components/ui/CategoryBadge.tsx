import { cn } from "@/lib/utils";
import {
  Home,
  Utensils,
  Sparkles,
  ShoppingBag,
  Car,
  Heart,
  GraduationCap,
  MoreHorizontal,
  Zap,
  Droplets,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { getCategoryDisplay } from "@/lib/categoryResolvers";
import type { HouseholdCategory } from "@/services/householdCategoriesService";

export type CategoryType =
  | "bills"
  | "food"
  | "leisure"
  | "shopping"
  | "transport"
  | "health"
  | "education"
  | "other";

interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  colorClass: string;
  bgClass: string;
}

export const categoryConfig: Record<CategoryType, CategoryConfig> = {
  bills: {
    label: "Contas Fixas",
    icon: Home,
    colorClass: "text-category-bills",
    bgClass: "bg-category-bills/20",
  },
  food: {
    label: "Alimentação",
    icon: Utensils,
    colorClass: "text-category-food",
    bgClass: "bg-category-food/20",
  },
  leisure: {
    label: "Lazer",
    icon: Sparkles,
    colorClass: "text-category-leisure",
    bgClass: "bg-category-leisure/20",
  },
  shopping: {
    label: "Compras",
    icon: ShoppingBag,
    colorClass: "text-category-shopping",
    bgClass: "bg-category-shopping/20",
  },
  transport: {
    label: "Transporte",
    icon: Car,
    colorClass: "text-category-transport",
    bgClass: "bg-category-transport/20",
  },
  health: {
    label: "Saúde",
    icon: Heart,
    colorClass: "text-category-health",
    bgClass: "bg-category-health/20",
  },
  education: {
    label: "Educação",
    icon: GraduationCap,
    colorClass: "text-category-education",
    bgClass: "bg-category-education/20",
  },
  other: {
    label: "Outros",
    icon: MoreHorizontal,
    colorClass: "text-category-other",
    bgClass: "bg-category-other/20",
  },
};

// Subcategorias para contas fixas
export const billSubcategories = [
  { id: "electricity", label: "Energia", icon: Zap },
  { id: "water", label: "Água", icon: Droplets },
  { id: "internet", label: "Internet", icon: Wifi },
  { id: "rent", label: "Aluguel", icon: Home },
];

interface CategoryBadgeProps {
  /** Categoria fixa (bills, food, ...) ou custom (custom:<uuid>) */
  category: CategoryType | string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
  /** Necessário quando category for custom:<uuid> para exibir nome/cor */
  customCategories?: HouseholdCategory[];
}

export function CategoryBadge({
  category,
  size = "md",
  showLabel = true,
  className,
  customCategories,
}: CategoryBadgeProps) {
  const config = getCategoryDisplay(category, customCategories);
  const Icon = config.icon;
  const iconSizes = { sm: "w-3 h-3", md: "w-4 h-4", lg: "w-5 h-5" };
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1.5 text-xs",
    lg: "px-4 py-2 text-sm",
  };
  const style = config.hexColor
    ? { backgroundColor: `${config.hexColor}20`, color: config.hexColor }
    : undefined;

  return (
    <span
      className={cn(
        "category-badge inline-flex items-center gap-1",
        !config.hexColor && config.bgClass,
        !config.hexColor && config.colorClass,
        sizeClasses[size],
        className
      )}
      style={style}
    >
      {config.iconUrl ? (
        <img src={config.iconUrl} alt="" className={cn(iconSizes[size], "rounded-full object-cover")} />
      ) : (
        <Icon className={iconSizes[size]} />
      )}
      {showLabel && config.label}
    </span>
  );
}

interface CategoryIconProps {
  category: CategoryType | string;
  size?: "sm" | "md" | "lg";
  className?: string;
  customCategories?: HouseholdCategory[];
}

export function CategoryIcon({ category, size = "md", className, customCategories }: CategoryIconProps) {
  const config = getCategoryDisplay(category, customCategories);
  const Icon = config.icon;
  const containerSizes = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-12 h-12" };
  const iconSizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };
  const style = config.hexColor
    ? { backgroundColor: `${config.hexColor}20`, color: config.hexColor }
    : undefined;

  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center overflow-hidden",
        !config.hexColor && config.bgClass,
        !config.hexColor && config.colorClass,
        containerSizes[size],
        className
      )}
      style={style}
    >
      {config.iconUrl ? (
        <img src={config.iconUrl} alt="" className={cn(iconSizes[size], "rounded-full object-cover")} />
      ) : (
        <Icon className={cn(iconSizes[size], config.hexColor ? "" : config.colorClass)} />
      )}
    </div>
  );
}
