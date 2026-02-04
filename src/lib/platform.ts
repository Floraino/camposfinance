import { Capacitor } from "@capacitor/core";

/**
 * Platform detection utilities for mobile app compatibility
 */

/**
 * Check if running as a native mobile app (iOS/Android via Capacitor)
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Get the current platform
 */
export function getPlatform(): "ios" | "android" | "web" {
  try {
    const platform = Capacitor.getPlatform();
    if (platform === "ios") return "ios";
    if (platform === "android") return "android";
    return "web";
  } catch {
    return "web";
  }
}

/**
 * Check if the platform allows in-app purchases via Stripe
 * Note: iOS and Android app stores have restrictions on external payment links
 * for digital goods. This function helps determine if we should show
 * subscription options or redirect to web.
 */
export function canUseStripeInApp(): boolean {
  // On web, Stripe is always allowed
  if (!isNativeApp()) return true;
  
  // For native apps, we'll use external browser for Stripe checkout
  // to comply with app store policies
  return false;
}

/**
 * Get the subscription URL for external checkout
 * This is used when in-app Stripe is not allowed
 */
export function getSubscriptionWebUrl(householdId: string, priceType: "monthly" | "yearly"): string {
  const baseUrl = "https://camposfinance.lovable.app";
  return `${baseUrl}/subscribe?householdId=${householdId}&plan=${priceType}`;
}

/**
 * Open URL in external browser (for native apps)
 * Falls back to window.open for web
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    try {
      // Use Capacitor Browser plugin
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
    } catch {
      // Fallback to window.open
      window.open(url, "_blank");
    }
  } else {
    window.open(url, "_blank");
  }
}

/**
 * Close the in-app browser (if open)
 */
export async function closeExternalBrowser(): Promise<void> {
  if (isNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Add listener for browser finished event
 */
export async function onBrowserFinished(callback: () => void): Promise<() => void> {
  if (isNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      const listener = await Browser.addListener("browserFinished", callback);
      return () => listener.remove();
    } catch {
      return () => {};
    }
  }
  return () => {};
}
