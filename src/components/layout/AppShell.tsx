/**
 * App Shell Component
 * Wraps the main app with deep link handling and mobile-specific features
 */

import { useEffect } from "react";
import { useDeepLinks } from "@/hooks/useDeepLinks";
import { isNativeApp } from "@/lib/platform";
import { setStatusBarStyle } from "@/lib/mobileInit";
import { useTheme } from "@/components/providers/ThemeProvider";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  // Setup deep link handling
  useDeepLinks();

  const { theme } = useTheme();

  // Sync status bar with theme
  useEffect(() => {
    if (isNativeApp()) {
      const isDark = theme === "dark" || 
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      setStatusBarStyle(isDark);
    }
  }, [theme]);

  return <>{children}</>;
}
