/**
 * Secure Storage Service for Mobile Apps
 * Uses Capacitor Preferences plugin with secure options
 * Falls back to localStorage on web
 */

import { Preferences } from "@capacitor/preferences";
import { isNativeApp } from "./platform";

const SECURE_KEYS = {
  AUTH_TOKEN: "auth_token",
  REFRESH_TOKEN: "refresh_token",
  SESSION_DATA: "session_data",
  DEVICE_ID: "device_id",
  ACTIVE_HOUSEHOLD: "active_household_id",
};

/**
 * Securely store a value
 * On mobile: Uses Capacitor Preferences (backed by Keychain/Keystore)
 * On web: Uses localStorage
 */
export async function secureSet(key: string, value: string): Promise<void> {
  if (isNativeApp()) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

/**
 * Securely retrieve a value
 */
export async function secureGet(key: string): Promise<string | null> {
  if (isNativeApp()) {
    const result = await Preferences.get({ key });
    return result.value;
  } else {
    return localStorage.getItem(key);
  }
}

/**
 * Securely remove a value
 */
export async function secureRemove(key: string): Promise<void> {
  if (isNativeApp()) {
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}

/**
 * Clear all secure storage
 */
export async function secureClearAll(): Promise<void> {
  if (isNativeApp()) {
    await Preferences.clear();
  } else {
    // Only clear auth-related keys, not everything
    Object.values(SECURE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  }
}

/**
 * Store auth session securely
 */
export async function storeAuthSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}): Promise<void> {
  await secureSet(SECURE_KEYS.AUTH_TOKEN, session.access_token);
  await secureSet(SECURE_KEYS.REFRESH_TOKEN, session.refresh_token);
  if (session.expires_at) {
    await secureSet(
      SECURE_KEYS.SESSION_DATA,
      JSON.stringify({ expires_at: session.expires_at })
    );
  }
}

/**
 * Retrieve stored auth session
 */
export async function getStoredAuthSession(): Promise<{
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}> {
  const access_token = await secureGet(SECURE_KEYS.AUTH_TOKEN);
  const refresh_token = await secureGet(SECURE_KEYS.REFRESH_TOKEN);
  const sessionData = await secureGet(SECURE_KEYS.SESSION_DATA);

  let expires_at: number | null = null;
  if (sessionData) {
    try {
      const parsed = JSON.parse(sessionData);
      expires_at = parsed.expires_at || null;
    } catch {
      // Ignore parse errors
    }
  }

  return { access_token, refresh_token, expires_at };
}

/**
 * Clear auth session from secure storage
 */
export async function clearAuthSession(): Promise<void> {
  await secureRemove(SECURE_KEYS.AUTH_TOKEN);
  await secureRemove(SECURE_KEYS.REFRESH_TOKEN);
  await secureRemove(SECURE_KEYS.SESSION_DATA);
}

/**
 * Store active household ID
 */
export async function storeActiveHousehold(householdId: string): Promise<void> {
  await secureSet(SECURE_KEYS.ACTIVE_HOUSEHOLD, householdId);
}

/**
 * Get stored active household ID
 */
export async function getStoredActiveHousehold(): Promise<string | null> {
  return secureGet(SECURE_KEYS.ACTIVE_HOUSEHOLD);
}

/**
 * Clear active household
 */
export async function clearActiveHousehold(): Promise<void> {
  await secureRemove(SECURE_KEYS.ACTIVE_HOUSEHOLD);
}

export { SECURE_KEYS };
