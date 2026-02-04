import { ReactNode, useState, useCallback } from "react";
import { useProFeature } from "@/hooks/useProFeature";
import { type ProFeatureKey } from "@/lib/proFeatures";
import { UpgradeModal } from "./UpgradeModal";
import { ProBadge, ProBadgeCorner } from "./ProBadge";

interface ProFeatureGateProps {
  /** The feature key to check */
  feature: ProFeatureKey;
  /** Children to render (the protected content) */
  children: ReactNode;
  /** Fallback content when feature is not allowed (optional) */
  fallback?: ReactNode;
  /** Whether to show upgrade modal on blocked action */
  showModal?: boolean;
  /** Callback when user clicks "Continue manually" */
  onContinueManually?: () => void;
}

/**
 * Gate component that wraps PRO features
 * 
 * Renders children only if the family has PRO access.
 * Otherwise shows fallback or nothing.
 * 
 * @example
 * ```tsx
 * <ProFeatureGate feature="OCR_SCAN">
 *   <OcrScanner />
 * </ProFeatureGate>
 * ```
 */
export function ProFeatureGate({ 
  feature, 
  children, 
  fallback = null,
  showModal = false,
  onContinueManually,
}: ProFeatureGateProps) {
  const { allowed } = useProFeature(feature);
  
  if (allowed) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

interface ProFeatureButtonProps {
  /** The feature key to check */
  feature: ProFeatureKey;
  /** The actual button/clickable element */
  children: ReactNode;
  /** Handler when feature is allowed and clicked */
  onAllowedClick: () => void;
  /** Handler when user clicks "Continue manually" (for features with alternatives) */
  onContinueManually?: () => void;
  /** Whether to show the PRO badge */
  showBadge?: boolean;
  /** Whether badge should be positioned in corner (absolute) */
  badgeInCorner?: boolean;
  /** Additional wrapper class */
  className?: string;
}

/**
 * Wrapper for buttons that trigger PRO features
 * 
 * Handles the click behavior:
 * - If allowed: executes onAllowedClick
 * - If not allowed: shows upgrade modal
 * 
 * @example
 * ```tsx
 * <ProFeatureButton 
 *   feature="OCR_SCAN" 
 *   onAllowedClick={() => startOcr()}
 *   onContinueManually={() => openManualForm()}
 *   showBadge
 * >
 *   <Button>Escanear Cupom</Button>
 * </ProFeatureButton>
 * ```
 */
export function ProFeatureButton({
  feature,
  children,
  onAllowedClick,
  onContinueManually,
  showBadge = true,
  badgeInCorner = true,
  className,
}: ProFeatureButtonProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { allowed, hasManualAlternative } = useProFeature(feature);
  
  const handleClick = useCallback(() => {
    if (allowed) {
      onAllowedClick();
    } else {
      setShowUpgradeModal(true);
    }
  }, [allowed, onAllowedClick]);

  const handleContinueManually = useCallback(() => {
    setShowUpgradeModal(false);
    onContinueManually?.();
  }, [onContinueManually]);

  return (
    <>
      <div 
        className={className}
        style={{ position: badgeInCorner ? 'relative' : undefined }}
        onClick={handleClick}
      >
        {children}
        {showBadge && !allowed && (
          badgeInCorner 
            ? <ProBadgeCorner show />
            : <ProBadge show className="ml-2" />
        )}
      </div>
      
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={feature}
        onContinueManually={hasManualAlternative && onContinueManually ? handleContinueManually : undefined}
      />
    </>
  );
}

/**
 * Hook-based approach for more complex scenarios
 */
export function useProFeatureGate(feature: ProFeatureKey) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const proFeature = useProFeature(feature);
  
  const guardedAction = useCallback(<T extends (...args: any[]) => any>(action: T) => {
    return (...args: Parameters<T>) => {
      if (proFeature.allowed) {
        return action(...args);
      } else {
        setShowUpgradeModal(true);
        return undefined;
      }
    };
  }, [proFeature.allowed]);

  const closeModal = useCallback(() => setShowUpgradeModal(false), []);

  return {
    ...proFeature,
    showUpgradeModal,
    setShowUpgradeModal,
    closeModal,
    guardedAction,
  };
}
