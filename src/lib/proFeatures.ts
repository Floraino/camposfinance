/**
 * Central configuration for PRO features
 * This is the SINGLE SOURCE OF TRUTH for all PRO feature definitions
 */

export type ProFeatureKey = 
  | "OCR_SCAN"
  | "OCR_IMAGE_EXTRACT"
  | "CSV_IMPORT"
  | "DATA_EXPORT"
  | "AI_ASSISTANT"
  | "UNLIMITED_ACCOUNTS";

export interface ProFeatureConfig {
  key: ProFeatureKey;
  name: string;
  description: string;
  manualAlternative?: string; // Text for "Continue manually" option
  icon: "scan" | "image" | "file" | "download" | "sparkles" | "wallet";
}

/**
 * All PRO features configuration
 * Add new PRO features here - they will automatically be protected
 */
export const PRO_FEATURES: Record<ProFeatureKey, ProFeatureConfig> = {
  OCR_SCAN: {
    key: "OCR_SCAN",
    name: "Escanear Cupom",
    description: "Extraia dados automaticamente de cupons fiscais com IA",
    manualAlternative: "Preencher manualmente",
    icon: "scan",
  },
  OCR_IMAGE_EXTRACT: {
    key: "OCR_IMAGE_EXTRACT",
    name: "Extração Automática",
    description: "Extraia dados automaticamente de imagens de recibos",
    manualAlternative: "Anexar e preencher manualmente",
    icon: "image",
  },
  CSV_IMPORT: {
    key: "CSV_IMPORT",
    name: "Importar CSV",
    description: "Importe transações em massa via planilha CSV",
    icon: "file",
  },
  DATA_EXPORT: {
    key: "DATA_EXPORT",
    name: "Exportar Relatórios",
    description: "Exporte relatórios detalhados em PDF ou Excel",
    icon: "download",
  },
  AI_ASSISTANT: {
    key: "AI_ASSISTANT",
    name: "Assistente IA",
    description: "Converse com a Clara, sua assistente financeira com IA",
    icon: "sparkles",
  },
  UNLIMITED_ACCOUNTS: {
    key: "UNLIMITED_ACCOUNTS",
    name: "Contas Ilimitadas",
    description: "Crie quantas contas bancárias precisar",
    icon: "wallet",
  },
};

/**
 * Get feature configuration by key
 */
export function getProFeatureConfig(key: ProFeatureKey): ProFeatureConfig {
  return PRO_FEATURES[key];
}

/**
 * Check if a feature key is valid
 */
export function isValidProFeature(key: string): key is ProFeatureKey {
  return key in PRO_FEATURES;
}
