/**
 * Deep Links Handler
 * Manages app URL schemes and universal links for Stripe checkout return
 */

import { App, URLOpenListenerEvent } from "@capacitor/app";
import { isNativeApp } from "./platform";

// URL scheme for the app
export const APP_SCHEME = "camposfinance";

// Deep link routes
export const DEEP_LINK_ROUTES = {
  BILLING_SUCCESS: "/billing/success",
  BILLING_CANCEL: "/billing/cancel",
  HOME: "/",
  SUBSCRIBE: "/subscribe",
};

type DeepLinkCallback = (path: string, params: URLSearchParams) => void;

let deepLinkCallbacks: DeepLinkCallback[] = [];
let isListenerSetup = false;

/**
 * Parse a deep link URL into path and params
 */
export function parseDeepLink(url: string): {
  path: string;
  params: URLSearchParams;
} | null {
  try {
    // Handle custom scheme: camposfinance://billing/success?session_id=xxx
    if (url.startsWith(`${APP_SCHEME}://`)) {
      const withoutScheme = url.replace(`${APP_SCHEME}://`, "");
      const [pathPart, queryPart] = withoutScheme.split("?");
      return {
        path: `/${pathPart}`,
        params: new URLSearchParams(queryPart || ""),
      };
    }

    // Handle HTTPS universal links: https://camposfinance.lovable.app/billing/success
    if (url.startsWith("https://")) {
      const urlObj = new URL(url);
      return {
        path: urlObj.pathname,
        params: urlObj.searchParams,
      };
    }

    return null;
  } catch (error) {
    console.error("Error parsing deep link:", error);
    return null;
  }
}

/**
 * Setup deep link listener
 * Call this once on app initialization
 */
export async function setupDeepLinkListener(): Promise<void> {
  if (!isNativeApp() || isListenerSetup) {
    return;
  }

  isListenerSetup = true;

  // Listen for app opened via URL
  App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    console.log("Deep link received:", event.url);

    const parsed = parseDeepLink(event.url);
    if (parsed) {
      deepLinkCallbacks.forEach((callback) => {
        callback(parsed.path, parsed.params);
      });
    }
  });

  // Check if app was opened with a URL (cold start)
  try {
    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) {
      console.log("App launched with URL:", launchUrl.url);
      const parsed = parseDeepLink(launchUrl.url);
      if (parsed) {
        // Delay to ensure app is ready
        setTimeout(() => {
          deepLinkCallbacks.forEach((callback) => {
            callback(parsed.path, parsed.params);
          });
        }, 500);
      }
    }
  } catch (error) {
    console.error("Error getting launch URL:", error);
  }
}

/**
 * Register a callback for deep links
 */
export function onDeepLink(callback: DeepLinkCallback): () => void {
  deepLinkCallbacks.push(callback);

  // Return unsubscribe function
  return () => {
    deepLinkCallbacks = deepLinkCallbacks.filter((cb) => cb !== callback);
  };
}

/**
 * Generate success/cancel URLs for Stripe checkout
 */
export function getStripeReturnUrls(householdId: string): {
  success: string;
  cancel: string;
} {
  if (isNativeApp()) {
    // Use custom URL scheme for mobile
    return {
      success: `${APP_SCHEME}://billing/success?householdId=${householdId}`,
      cancel: `${APP_SCHEME}://billing/cancel?householdId=${householdId}`,
    };
  } else {
    // Use web URLs
    const baseUrl = window.location.origin;
    return {
      success: `${baseUrl}/?payment=success&householdId=${householdId}`,
      cancel: `${baseUrl}/?payment=cancel&householdId=${householdId}`,
    };
  }
}

/**
 * Check if a path is a billing-related deep link
 */
export function isBillingDeepLink(path: string): boolean {
  return (
    path === DEEP_LINK_ROUTES.BILLING_SUCCESS ||
    path === DEEP_LINK_ROUTES.BILLING_CANCEL ||
    path.startsWith("/billing/")
  );
}
