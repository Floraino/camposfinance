import { categoryConfig, type CategoryType } from "@/components/ui/CategoryBadge";
import { CUSTOM_CATEGORY_PREFIX, type HouseholdCategory } from "@/services/householdCategoriesService";
import { getPresetIcon } from "@/lib/categoryIcons";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";

/** Chaves das categorias fixas (evita uso de categoryConfig na inicialização e quebra dependência circular com CategoryBadge). */
const FIXED_CATEGORY_KEYS = ["bills", "food", "leisure", "shopping", "transport", "health", "education", "other"] as const;
const FIXED_CATEGORIES = new Set<string>(FIXED_CATEGORY_KEYS);

/** Cores para gráficos (fixas). Custom usa custom.color no resolver. */
const FIXED_CHART_COLORS: Record<string, string> = {
  bills: "hsl(195, 50%, 35%)",
  food: "hsl(35, 60%, 50%)",
  leisure: "hsl(280, 40%, 50%)",
  shopping: "hsl(330, 50%, 50%)",
  transport: "hsl(200, 60%, 45%)",
  health: "hsl(0, 50%, 55%)",
  education: "hsl(170, 50%, 40%)",
  other: "hsl(220, 15%, 45%)",
};

export interface CategoryDisplay {
  label: string;
  icon: LucideIcon;
  colorClass: string;
  bgClass: string;
  /** Para custom: cor hex opcional para estilo inline */
  hexColor?: string;
  /** Quando ícone é upload: URL da imagem (renderizar <img> em vez de <Icon>) */
  iconUrl?: string;
}

/** Indica se o valor é uma categoria fixa (enum do app). */
export function isFixedCategory(category: string): category is CategoryType {
  return FIXED_CATEGORIES.has(category);
}

/** Resolve category (fixo ou custom:<uuid>) para exibição. customCategories pode incluir arquivadas. */
export function getCategoryDisplay(
  category: string,
  customCategories?: HouseholdCategory[]
): CategoryDisplay {
  if (category.startsWith(CUSTOM_CATEGORY_PREFIX)) {
    const id = category.slice(CUSTOM_CATEGORY_PREFIX.length);
    const custom = customCategories?.find((c) => c.id === id);
    if (custom) {
      const icon =
        custom.icon_type === "preset" && custom.icon_key
          ? getPresetIcon(custom.icon_key)
          : MoreHorizontal;
      return {
        label: custom.is_archived ? `(Arquivada) ${custom.name}` : custom.name,
        icon,
        colorClass: custom.color ? "" : "text-category-other",
        bgClass: custom.color ? "" : "bg-category-other/20",
        hexColor: custom.color ?? undefined,
        iconUrl:
          custom.icon_type === "upload" && custom.icon_url ? (custom.icon_url as string) : undefined,
      };
    }
    return {
      label: "Outros",
      icon: MoreHorizontal,
      colorClass: "text-category-other",
      bgClass: "bg-category-other/20",
    };
  }
  const fixed = categoryConfig[category as CategoryType];
  if (fixed) return fixed;
  return {
    label: "Outros",
    icon: MoreHorizontal,
    colorClass: "text-category-other",
    bgClass: "bg-category-other/20",
  };
}

/** Cor para uso em gráficos (hex ou hsl). */
export function getCategoryChartColor(category: string, customCategories?: HouseholdCategory[]): string {
  if (category.startsWith(CUSTOM_CATEGORY_PREFIX)) {
    const id = category.slice(CUSTOM_CATEGORY_PREFIX.length);
    const custom = customCategories?.find((c) => c.id === id);
    if (custom?.color) return custom.color;
    return FIXED_CHART_COLORS.other;
  }
  return FIXED_CHART_COLORS[category] ?? FIXED_CHART_COLORS.other;
}

/** Lista de valores de categoria para picker: fixas + custom (value = slug ou custom:id). */
export function getCategoryOptionsForPicker(
  customCategories: HouseholdCategory[],
  includeArchived = false
): Array<{ value: string; label: string; isCustom: boolean }> {
  const fixed = (Object.keys(categoryConfig) as CategoryType[]).map((id) => ({
    value: id,
    label: categoryConfig[id].label,
    isCustom: false,
  }));
  const custom = (includeArchived ? customCategories : customCategories.filter((c) => !c.is_archived))
    .map((c) => ({
      value: `${CUSTOM_CATEGORY_PREFIX}${c.id}`,
      label: c.is_archived ? `(Arquivada) ${c.name}` : c.name,
      isCustom: true,
    }));
  return [...fixed, ...custom];
}

/** Map category id -> label para enviar à IA (fixas + custom). */
export function getCategoryLabelsForApi(customCategories: HouseholdCategory[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [id, config] of Object.entries(categoryConfig)) {
    map[id] = config.label;
  }
  for (const c of customCategories.filter((c) => !c.is_archived)) {
    map[`${CUSTOM_CATEGORY_PREFIX}${c.id}`] = c.name;
  }
  return map;
}
