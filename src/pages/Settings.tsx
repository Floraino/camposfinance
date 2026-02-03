import { ChevronRight, Moon, Bell, Shield, Users, Download, HelpCircle, LogOut } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Switch } from "@/components/ui/switch";

const settingsGroups = [
  {
    title: "Preferências",
    items: [
      {
        icon: Moon,
        label: "Tema Escuro",
        description: "Ativado por padrão",
        hasSwitch: true,
        enabled: true,
      },
      {
        icon: Bell,
        label: "Notificações",
        description: "Lembretes de contas",
        hasSwitch: true,
        enabled: true,
      },
    ],
  },
  {
    title: "Família",
    items: [
      {
        icon: Users,
        label: "Membros da Casa",
        description: "Gerenciar quem usa o app",
        hasArrow: true,
      },
    ],
  },
  {
    title: "Dados",
    items: [
      {
        icon: Download,
        label: "Exportar Relatório",
        description: "PDF ou Excel",
        hasArrow: true,
      },
      {
        icon: Shield,
        label: "Segurança",
        description: "Backup automático ativado",
        hasArrow: true,
      },
    ],
  },
  {
    title: "Suporte",
    items: [
      {
        icon: HelpCircle,
        label: "Ajuda",
        description: "Perguntas frequentes",
        hasArrow: true,
      },
    ],
  },
];

export default function Settings() {
  return (
    <MobileLayout>
      <div className="px-4 pt-safe">
        {/* Header */}
        <header className="py-4 mb-2">
          <h1 className="text-2xl font-bold text-foreground">Ajustes</h1>
        </header>

        {/* User Card */}
        <div className="glass-card p-4 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-2xl">🏠</span>
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Família Silva</h2>
            <p className="text-sm text-muted-foreground">3 membros • Plano Gratuito</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>

        {/* Settings Groups */}
        <div className="space-y-6 pb-4">
          {settingsGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                {group.title}
              </h3>
              <div className="glass-card divide-y divide-border overflow-hidden">
                {group.items.map((item, index) => (
                  <button
                    key={index}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                    {item.hasSwitch && (
                      <Switch checked={item.enabled} />
                    )}
                    {item.hasArrow && (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Logout */}
          <button className="w-full flex items-center justify-center gap-3 p-4 text-destructive font-medium">
            <LogOut className="w-5 h-5" />
            Sair da Conta
          </button>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          CasaClara v1.0.0
        </p>
      </div>
    </MobileLayout>
  );
}
