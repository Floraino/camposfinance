import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSwRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
          onOfflineReady: () => {},
          onRegistered(registration) {
            if (registration?.waiting) setNeedRefresh(true);
          },
        });
        updateSwRef.current = updateSW;
      })
      .catch(() => {});
  }, []);

  const handleReload = () => {
    updateSwRef.current?.();
    setNeedRefresh(false);
  };

  if (!needRefresh) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[100] flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
      role="alert"
    >
      <span className="text-sm font-medium text-foreground">Atualização disponível</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setNeedRefresh(false)}>
          Depois
        </Button>
        <Button size="sm" onClick={handleReload} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Recarregar
        </Button>
      </div>
    </div>
  );
}
