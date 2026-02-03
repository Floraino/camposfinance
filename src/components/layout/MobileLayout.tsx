import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface MobileLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function MobileLayout({ children, hideNav = false }: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-24 overflow-y-auto scrollbar-hide">
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
