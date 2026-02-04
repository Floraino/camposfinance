/**
 * In-App Purchases Service
 * 
 * This service provides a unified interface for handling subscriptions
 * across different platforms (iOS App Store, Google Play, Web/Stripe).
 * 
 * IMPORTANT: For iOS and Android, you need to:
 * 1. Set up your project with Capacitor (npx cap init)
 * 2. Add iOS/Android platforms (npx cap add ios/android)
 * 3. Install the Capacitor Purchases plugin (npm install @revenuecat/purchases-capacitor)
 * 4. Configure your products in App Store Connect and Google Play Console
 * 
 * For now, this file provides the structure. Native implementations require
 * the Capacitor wrapper to be set up on your local machine.
 */

import { supabase } from "@/integrations/supabase/client";

export type Platform = "web" | "ios" | "android";
export type SubscriptionInterval = "monthly" | "yearly";

export interface PurchaseProduct {
  id: string;
  identifier: string;
  title: string;
  description: string;
  price: number;
  priceString: string;
  currency: string;
  interval: SubscriptionInterval;
}

export interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  productId?: string;
  error?: string;
}

// Product identifiers for each platform
export const PRODUCT_IDS = {
  ios: {
    monthly: "family_pro_monthly",
    yearly: "family_pro_annual",
  },
  android: {
    monthly: "family_pro_monthly",
    yearly: "family_pro_annual",
  },
  web: {
    monthly: "price_1Sx5JBCMS8wbBKNVzTZwPNoc",
    yearly: "price_1Sx5JNCMS8wbBKNVadnybnKC",
  },
};

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  // Check if running in Capacitor
  if (typeof window !== "undefined" && (window as any).Capacitor) {
    const platform = (window as any).Capacitor.getPlatform();
    if (platform === "ios") return "ios";
    if (platform === "android") return "android";
  }
  return "web";
}

/**
 * Check if the app is running as a native app
 */
export function isNativeApp(): boolean {
  const platform = detectPlatform();
  return platform === "ios" || platform === "android";
}

/**
 * Validate a purchase receipt with the backend
 * This works for both iOS (App Store) and Android (Google Play)
 */
export async function validatePurchase(
  householdId: string,
  platform: "ios" | "android",
  receipt: string,
  productId: string
): Promise<{ success: boolean; error?: string }> {
  const endpoint = platform === "ios" 
    ? "validate-ios-receipt" 
    : "validate-android-purchase";
  
  const { data, error } = await supabase.functions.invoke(endpoint, {
    body: {
      householdId,
      receipt,
      productId,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: data?.success ?? false, error: data?.error };
}

/**
 * Restore purchases (for iOS/Android)
 * This re-validates existing purchases and updates the family plan
 */
export async function restorePurchases(
  householdId: string
): Promise<{ success: boolean; restored: boolean; error?: string }> {
  const platform = detectPlatform();
  
  if (platform === "web") {
    // For web, check Stripe subscription status
    const { data, error } = await supabase.functions.invoke("check-subscription", {
      body: { householdId },
    });
    
    if (error) {
      return { success: false, restored: false, error: error.message };
    }
    
    return { 
      success: true, 
      restored: data?.subscribed ?? false 
    };
  }
  
  // For native platforms, this would use the native IAP plugin
  // Implementation requires Capacitor setup
  console.log("Native restore purchases not yet implemented");
  return { 
    success: false, 
    restored: false, 
    error: "Por favor, configure o app nativo para restaurar compras" 
  };
}

/**
 * Get the manage subscription URL based on platform
 */
export function getManageSubscriptionUrl(platform: Platform): string {
  switch (platform) {
    case "ios":
      return "https://apps.apple.com/account/subscriptions";
    case "android":
      return "https://play.google.com/store/account/subscriptions";
    case "web":
    default:
      // For web, we use Stripe Customer Portal (handled differently)
      return "";
  }
}

/**
 * Open the native subscription management page
 * For iOS: Opens App Store subscriptions
 * For Android: Opens Google Play subscriptions
 * For Web: Opens Stripe Customer Portal (handled separately)
 */
export function openNativeSubscriptionManagement(): void {
  const platform = detectPlatform();
  const url = getManageSubscriptionUrl(platform);
  
  if (url) {
    window.open(url, "_blank");
  }
}

/**
 * Initialize IAP (In-App Purchases)
 * This should be called when the app starts
 * 
 * For native implementation, install and configure:
 * - @revenuecat/purchases-capacitor (recommended)
 * - or @capacitor-community/in-app-purchases
 */
export async function initializeIAP(): Promise<void> {
  const platform = detectPlatform();
  
  if (platform === "web") {
    // Web uses Stripe, no initialization needed
    console.log("IAP: Web platform, using Stripe");
    return;
  }
  
  // For native platforms, initialize the IAP plugin
  // This is a placeholder - actual implementation requires Capacitor setup
  console.log(`IAP: Native platform (${platform}), initialization needed`);
  
  // Example with RevenueCat (recommended for production):
  // import Purchases from '@revenuecat/purchases-capacitor';
  // await Purchases.configure({ apiKey: 'YOUR_REVENUECAT_API_KEY' });
}

/**
 * Native purchase flow placeholder
 * 
 * In production with Capacitor, this would:
 * 1. Call the native IAP SDK to initiate purchase
 * 2. Handle the purchase result
 * 3. Send receipt to backend for validation
 * 4. Update the family plan
 */
export async function purchaseNative(
  householdId: string,
  productId: string
): Promise<PurchaseResult> {
  const platform = detectPlatform();
  
  if (platform === "web") {
    return { 
      success: false, 
      error: "Use Stripe for web purchases" 
    };
  }
  
  // Placeholder for native implementation
  console.log(`Native purchase for ${productId} on ${platform}`);
  
  return {
    success: false,
    error: "Configure o app nativo para realizar compras",
  };
}
