/**
 * Mobile App Initialization
 * Sets up native plugins and configurations on app start
 */

import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { App } from "@capacitor/app";
import { isNativeApp, getPlatform } from "./platform";
import { setupDeepLinkListener } from "./deepLinks";

/**
 * Initialize mobile-specific configurations
 * Call this on app startup
 */
export async function initializeMobileApp(): Promise<void> {
  if (!isNativeApp()) {
    console.log("Running on web, skipping mobile initialization");
    return;
  }

  console.log(`Initializing mobile app on ${getPlatform()}`);

  try {
    // Configure status bar
    await configureStatusBar();

    // Configure keyboard
    await configureKeyboard();

    // Setup deep link handling
    await setupDeepLinkListener();

    // Setup back button handler (Android)
    await setupBackButtonHandler();

    // Hide splash screen after initialization
    await SplashScreen.hide({
      fadeOutDuration: 300,
    });

    console.log("Mobile app initialized successfully");
  } catch (error) {
    console.error("Error initializing mobile app:", error);
    // Still hide splash screen even if there are errors
    try {
      await SplashScreen.hide();
    } catch {
      // Ignore
    }
  }
}

/**
 * Configure status bar appearance
 */
async function configureStatusBar(): Promise<void> {
  try {
    const platform = getPlatform();

    // Set status bar style based on theme
    // We default to dark content for our light theme
    await StatusBar.setStyle({ style: Style.Dark });

    if (platform === "android") {
      // Make status bar transparent on Android
      await StatusBar.setBackgroundColor({ color: "#1a1a1f" });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch (error) {
    console.error("Error configuring status bar:", error);
  }
}

/**
 * Configure keyboard behavior
 */
async function configureKeyboard(): Promise<void> {
  try {
    const platform = getPlatform();

    if (platform === "ios") {
      // iOS-specific keyboard settings
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
      await Keyboard.setScroll({ isDisabled: false });
    }

    // Listen for keyboard events
    Keyboard.addListener("keyboardWillShow", (info) => {
      document.body.style.setProperty(
        "--keyboard-height",
        `${info.keyboardHeight}px`
      );
      document.body.classList.add("keyboard-visible");
    });

    Keyboard.addListener("keyboardWillHide", () => {
      document.body.style.setProperty("--keyboard-height", "0px");
      document.body.classList.remove("keyboard-visible");
    });
  } catch (error) {
    console.error("Error configuring keyboard:", error);
  }
}

/**
 * Setup Android back button handler
 */
async function setupBackButtonHandler(): Promise<void> {
  if (getPlatform() !== "android") {
    return;
  }

  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // If we can't go back, minimize the app
      App.minimizeApp();
    }
  });
}

/**
 * Set status bar style based on theme
 */
export async function setStatusBarStyle(isDark: boolean): Promise<void> {
  if (!isNativeApp()) {
    return;
  }

  try {
    await StatusBar.setStyle({
      style: isDark ? Style.Light : Style.Dark,
    });

    if (getPlatform() === "android") {
      await StatusBar.setBackgroundColor({
        color: isDark ? "#1a1a1f" : "#f5f3f0",
      });
    }
  } catch (error) {
    console.error("Error setting status bar style:", error);
  }
}
