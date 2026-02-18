/**
 * Catálogo de ícones predefinidos para categorias personalizadas.
 * Chaves armazenadas em household_categories.icon_key; componentes Lucide para renderização.
 */
import {
  Home,
  Zap,
  Utensils,
  Car,
  Heart,
  BookOpen,
  Gamepad2,
  ShoppingBag,
  Gift,
  Briefcase,
  Plane,
  Sparkles,
  Wallet,
  Smartphone,
  Tv,
  Dumbbell,
  Palette,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

export const PRESET_ICON_KEYS = [
  "home",
  "bolt",
  "utensils",
  "car",
  "heart",
  "book",
  "gamepad",
  "shopping-bag",
  "gift",
  "briefcase",
  "plane",
  "sparkles",
  "wallet",
  "smartphone",
  "tv",
  "dumbbell",
  "palette",
] as const;

export type PresetIconKey = (typeof PRESET_ICON_KEYS)[number];

const PRESET_ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  bolt: Zap,
  utensils: Utensils,
  car: Car,
  heart: Heart,
  book: BookOpen,
  gamepad: Gamepad2,
  "shopping-bag": ShoppingBag,
  paw: Heart,
  gift: Gift,
  briefcase: Briefcase,
  plane: Plane,
  sparkles: Sparkles,
  wallet: Wallet,
  smartphone: Smartphone,
  tv: Tv,
  dumbbell: Dumbbell,
  palette: Palette,
};

/** Retorna o ícone Lucide para a chave predefinida ou MoreHorizontal como fallback. */
export function getPresetIcon(key: string | null | undefined): LucideIcon {
  if (!key) return MoreHorizontal;
  return PRESET_ICON_MAP[key] ?? MoreHorizontal;
}

/** Labels para exibição no seletor de ícones. */
export const PRESET_ICON_LABELS: Record<string, string> = {
  home: "Casa",
  bolt: "Energia",
  utensils: "Comida",
  car: "Carro",
  heart: "Saúde",
  book: "Livro",
  gamepad: "Jogos",
  "shopping-bag": "Compras",
  paw: "Pet",
  gift: "Presente",
  briefcase: "Trabalho",
  plane: "Viagem",
  sparkles: "Lazer",
  wallet: "Carteira",
  smartphone: "Celular",
  tv: "TV",
  dumbbell: "Academia",
  palette: "Arte",
};