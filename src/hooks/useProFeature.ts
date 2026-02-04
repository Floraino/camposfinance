import { useCallback, useMemo } from "react";
import { useHousehold } from "./useHousehold";
import { type ProFeatureKey, getProFeatureConfig } from "@/lib/proFeatures";

export interface ProFeatureResult {
  /** Whether the feature is allowed for the current family */
  allowed: boolean;
  /** Reason why the feature is blocked (if not allowed) */
  reason: string;
  /** Whether the current user can upgrade (is owner/admin) */
  canUpgrade: boolean;
  /** The family's current plan type */
  planType: "BASIC" | "PRO";
  /** Whether the feature has a manual alternative */
  hasManualAlternative: boolean;
  /** Text for the manual alternative button */
  manualAlternativeText?: string;
  /** Feature display name */
  featureName: string;
  /** Feature description */
  featureDescription: string;
}

/**
 * Central hook for checking PRO feature access
 * 
 * This is the SINGLE SOURCE OF TRUTH for all PRO feature checks.
 * Use this hook in every component that needs to check PRO access.
 * 
 * @example
 * ```tsx
 * const { allowed, reason, canUpgrade } = useProFeature("OCR_SCAN");
 * 
 * if (!allowed) {
 *   return <UpgradePrompt reason={reason} canUpgrade={canUpgrade} />;
 * }
 * ```
 */
export function useProFeature(featureKey: ProFeatureKey): ProFeatureResult {
  const { planType, isAdmin, isOwner } = useHousehold();
  
  const featureConfig = useMemo(() => getProFeatureConfig(featureKey), [featureKey]);
  
  const allowed = planType === "PRO";
  const canUpgrade = isAdmin || isOwner;
  
  const reason = allowed 
    ? "" 
    : "Este é um recurso Pro da Família. Atualize seu plano para usar.";

  return {
    allowed,
    reason,
    canUpgrade,
    planType,
    hasManualAlternative: !!featureConfig.manualAlternative,
    manualAlternativeText: featureConfig.manualAlternative,
    featureName: featureConfig.name,
    featureDescription: featureConfig.description,
  };
}

/**
 * Hook that returns a function to check multiple features
 * Useful when you need to check different features dynamically
 */
export function useProFeatureChecker() {
  const { planType, isAdmin, isOwner } = useHousehold();
  
  const checkFeature = useCallback((featureKey: ProFeatureKey): ProFeatureResult => {
    const featureConfig = getProFeatureConfig(featureKey);
    const allowed = planType === "PRO";
    const canUpgrade = isAdmin || isOwner;
    
    return {
      allowed,
      reason: allowed ? "" : "Este é um recurso Pro da Família. Atualize seu plano para usar.",
      canUpgrade,
      planType,
      hasManualAlternative: !!featureConfig.manualAlternative,
      manualAlternativeText: featureConfig.manualAlternative,
      featureName: featureConfig.name,
      featureDescription: featureConfig.description,
    };
  }, [planType, isAdmin, isOwner]);
  
  return { checkFeature, planType, canUpgrade: isAdmin || isOwner };
}

/**
 * Simple boolean check for PRO access
 * Use when you just need to know if a feature is allowed
 */
export function useIsProFeatureAllowed(featureKey: ProFeatureKey): boolean {
  const { planType } = useHousehold();
  return planType === "PRO";
}
