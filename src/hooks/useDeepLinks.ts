/**
 * Hook for handling deep links in the app
 * Manages Stripe checkout return and other deep link routing
 */

import { useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useHousehold } from "@/hooks/useHousehold";
import { useToast } from "@/hooks/use-toast";
import { onDeepLink, isBillingDeepLink, DEEP_LINK_ROUTES } from "@/lib/deepLinks";
import { checkSubscription } from "@/services/subscriptionService";
import { isNativeApp } from "@/lib/platform";

export function useDeepLinks() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentHousehold, refreshHouseholds } = useHousehold();
  const { toast } = useToast();

  // Handle billing deep links
  const handleBillingDeepLink = useCallback(
    async (path: string, params: URLSearchParams) => {
      const householdId = params.get("householdId") || currentHousehold?.id;

      if (!householdId) {
        console.warn("No household ID in billing deep link");
        return;
      }

      if (path === DEEP_LINK_ROUTES.BILLING_SUCCESS || path.includes("success")) {
        toast({
          title: "Pagamento processando",
          description: "Verificando sua assinatura...",
        });

        // Check subscription status
        try {
          const status = await checkSubscription(householdId);
          
          if (status.subscribed) {
            toast({
              title: "🎉 Assinatura ativada!",
              description: "Bem-vindo ao plano PRO da família!",
            });
            
            // Refresh household to get updated plan
            await refreshHouseholds?.();
          } else {
            // Subscription might still be processing
            toast({
              title: "Processando pagamento",
              description: "Seu plano será ativado em alguns instantes.",
            });
          }
        } catch (error) {
          console.error("Error checking subscription:", error);
        }

        // Navigate to dashboard
        navigate("/", { replace: true });
      } else if (path === DEEP_LINK_ROUTES.BILLING_CANCEL || path.includes("cancel")) {
        toast({
          title: "Pagamento cancelado",
          description: "Você pode tentar novamente quando quiser.",
          variant: "destructive",
        });
        navigate("/", { replace: true });
      }
    },
    [currentHousehold, navigate, toast, refreshHouseholds]
  );

  // Handle web URL params (for Stripe redirect on web)
  useEffect(() => {
    const payment = searchParams.get("payment");
    const householdId = searchParams.get("householdId");

    if (payment === "success" && householdId) {
      handleBillingDeepLink(DEEP_LINK_ROUTES.BILLING_SUCCESS, searchParams);
    } else if (payment === "cancel") {
      handleBillingDeepLink(DEEP_LINK_ROUTES.BILLING_CANCEL, searchParams);
    }
  }, [searchParams, handleBillingDeepLink]);

  // Setup native deep link listener
  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    const unsubscribe = onDeepLink((path, params) => {
      console.log("Deep link received in hook:", path);

      if (isBillingDeepLink(path)) {
        handleBillingDeepLink(path, params);
      } else {
        // Handle other deep links
        navigate(path, { replace: true });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [handleBillingDeepLink, navigate]);
}
