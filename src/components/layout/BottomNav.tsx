import { Home, Receipt, PlusCircle, MessageCircle, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: "Início", path: "/" },
  { icon: Receipt, label: "Gastos", path: "/transactions" },
  { icon: PlusCircle, label: "Novo", path: "/add" },
  { icon: MessageCircle, label: "Clara", path: "/assistant" },
  { icon: Settings, label: "Ajustes", path: "/settings" },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;
        const isAdd = item.path === "/add";

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              "bottom-nav-item",
              isActive && "active",
              isAdd && "relative"
            )}
          >
            {isAdd ? (
              <div className="w-12 h-12 -mt-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-lg">
                <Icon className="w-6 h-6" />
              </div>
            ) : (
              <Icon className={cn("w-6 h-6", isActive && "text-primary")} />
            )}
            <span className={cn(
              "text-xs font-medium",
              isAdd && "-mt-1"
            )}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
