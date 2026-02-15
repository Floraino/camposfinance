import { useState, useRef, useEffect } from "react";
import { ChevronRight, Moon, Bell, Shield, Users, Download, Upload, HelpCircle, LogOut, User, Camera, X, Loader2, Crown, Home, Wallet, RefreshCw, Split, Zap, Target, AlertTriangle, CreditCard, Smartphone } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import { useAdmin } from "@/hooks/useAdmin";
import { useProFeature } from "@/hooks/useProFeature";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FamilyMembersSheet } from "@/components/settings/FamilyMembersSheet";
import { FamilyPlanSheet } from "@/components/settings/FamilyPlanSheet";
import { AccountsSheet } from "@/components/settings/AccountsSheet";
import { ExportReportSheet } from "@/components/settings/ExportReportSheet";
import { HelpSheet } from "@/components/settings/HelpSheet";
import { SecuritySheet } from "@/components/settings/SecuritySheet";
import { ImportCSVSheet } from "@/components/transactions/ImportCSVSheet";
import { PlanBadge } from "@/components/paywall/PlanBadge";
import { UpgradeModal } from "@/components/paywall/UpgradeModal";
import { ProBadge, ProIndicator } from "@/components/paywall/ProBadge";
import { HouseholdSwitcher } from "@/components/household/HouseholdSwitcher";
import { CategorizationRulesSheet } from "@/components/settings/CategorizationRulesSheet";
import { CategoryBudgetsSheet } from "@/components/settings/CategoryBudgetsSheet";

export default function Settings() {
  const { profile, user, signOut } = useAuth();
  const { currentHousehold, planType, isAdmin, canExportReports } = useHousehold();
  const { isSuperAdmin } = useAdmin();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Use centralized PRO feature checks
  const csvFeature = useProFeature("CSV_IMPORT");
  const exportFeature = useProFeature("DATA_EXPORT");
  const { installable, install, installed, isIOS } = usePWAInstall();
  
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showFamilyMembers, setShowFamilyMembers] = useState(false);
  const [showFamilyPlan, setShowFamilyPlan] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showExportReport, setShowExportReport] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCategorizationRules, setShowCategorizationRules] = useState(false);
  const [showCategoryBudgets, setShowCategoryBudgets] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<"CSV_IMPORT" | "DATA_EXPORT">("CSV_IMPORT");
  
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [darkMode, setDarkMode] = useState(resolvedTheme === "dark");
  const [notifications, setNotifications] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle subscription success/cancel from Stripe redirect
  useEffect(() => {
    const subscriptionResult = searchParams.get("subscription");
    if (subscriptionResult === "success") {
      toast({
        title: "Assinatura ativada! 🎉",
        description: "Sua família agora tem acesso ao plano PRO.",
      });
      // Clear the query param
      searchParams.delete("subscription");
      setSearchParams(searchParams);
      // Refresh to get updated plan
      window.location.reload();
    } else if (subscriptionResult === "cancelled") {
      toast({
        title: "Pagamento cancelado",
        description: "Você pode tentar novamente quando quiser.",
        variant: "destructive",
      });
      searchParams.delete("subscription");
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, toast]);

  // Load preferences from database
  useEffect(() => {
    if (user) {
      loadPreferences();
    }
  }, [user]);

  // Update theme when darkMode changes
  useEffect(() => {
    setTheme(darkMode ? "dark" : "light");
  }, [darkMode, setTheme]);

  const loadPreferences = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setDarkMode(data.dark_mode);
        setNotifications(data.notifications_enabled);
      }
    } catch (error) {
      // Preferences don't exist yet, use defaults
      console.log("No preferences found, using defaults");
    }
  };

  const savePreference = async (key: "dark_mode" | "notifications_enabled", value: boolean) => {
    if (!user) return;

    try {
      // Try to update existing
      const { data: existing } = await supabase
        .from("user_preferences")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        await supabase
          .from("user_preferences")
          .update({ [key]: value, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("user_preferences")
          .insert({
            user_id: user.id,
            [key]: value,
          });
      }
    } catch (error) {
      console.error("Error saving preference:", error);
    }
  };

  const handleDarkModeChange = (checked: boolean) => {
    setDarkMode(checked);
    savePreference("dark_mode", checked);
  };

  const handleNotificationsChange = (checked: boolean) => {
    setNotifications(checked);
    savePreference("notifications_enabled", checked);
    toast({
      title: checked ? "Notificações ativadas" : "Notificações desativadas",
      description: checked 
        ? "Você receberá lembretes de contas." 
        : "Você não receberá mais lembretes.",
    });
  };

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Até logo!",
      description: "Você saiu da sua conta.",
    });
    navigate("/auth");
  };

  const handleAvatarSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Show preview
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Add cache buster to force refresh
      setAvatarPreview(`${publicUrl}?t=${Date.now()}`);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({
        title: "Erro ao enviar foto",
        description: "Tente novamente",
        variant: "destructive",
      });
      setAvatarPreview(profile?.avatar_url || null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);

    try {
      // Get the avatar URL from storage if uploaded
      let avatarUrl = profile?.avatar_url;
      
      // Check if there's a new avatar uploaded
      const { data: files } = await supabase.storage
        .from('avatars')
        .list(user.id);

      if (files && files.length > 0) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(`${user.id}/${files[0].name}`);
        avatarUrl = publicUrl;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({
            display_name: displayName,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            display_name: displayName || user.email?.split('@')[0] || 'Usuário',
            avatar_url: avatarUrl,
          });

        if (error) throw error;
      }

      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram salvas.",
      });

      setShowEditProfile(false);
      
      // Reload the page to refresh profile data
      window.location.reload();
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar o perfil",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MobileLayout>
      <div className="px-4 pt-safe">
        {/* Header */}
        <header className="py-4 mb-2">
          <h1 className="text-2xl font-bold text-foreground">Ajustes</h1>
        </header>

        {/* User Card */}
        <button 
          onClick={() => {
            setDisplayName(profile?.display_name || "");
            setAvatarPreview(profile?.avatar_url || null);
            setShowEditProfile(true);
          }}
          className="w-full glass-card p-4 mb-6 flex items-center gap-4 touch-feedback"
        >
          <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-7 h-7 text-accent" />
            )}
          </div>
          <div className="flex-1 text-left">
            <h2 className="font-semibold text-foreground">
              {profile?.display_name || "Usuário"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user?.email}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Settings Groups */}
        <div className="space-y-6 pb-4">
          {/* Preferences */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
              Preferências
            </h3>
            <div className="glass-card divide-y divide-border overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Moon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Tema Escuro</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {darkMode ? "Ativado" : "Desativado"}
                  </p>
                </div>
                <Switch checked={darkMode} onCheckedChange={handleDarkModeChange} />
              </div>
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Notificações</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Lembretes de contas
                  </p>
                </div>
                <Switch checked={notifications} onCheckedChange={handleNotificationsChange} />
              </div>
            </div>
          </div>

          {/* Family */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
              Família
            </h3>
            
            {/* Household Card with Switcher */}
            <HouseholdSwitcher>
              <div className="glass-card p-4 mb-3 cursor-pointer hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Home className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{currentHousehold?.name || "Minha Casa"}</p>
                    <p className="text-sm text-muted-foreground">
                      Plano: <span className={planType === "PRO" ? "text-amber-500" : ""}>{planType}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PlanBadge size="sm" showLabel={false} />
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Toque para trocar de família
                </p>
              </div>
            </HouseholdSwitcher>

            <div className="glass-card divide-y divide-border overflow-hidden">
              <button 
                onClick={() => setShowFamilyPlan(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Crown className={`w-5 h-5 ${planType === "PRO" ? "text-amber-500" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Plano da Família</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {planType === "PRO" ? "Gerenciar assinatura" : "Ver benefícios Pro"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => setShowAccounts(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors border-t border-border"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Contas</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Carteiras e bancos ({planType === "PRO" ? "ilimitado" : "até 2"})
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => navigate("/credit-cards")}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors border-t border-border"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Cartões de Crédito</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Gerenciar cartões e faturas
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => setShowFamilyMembers(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors border-t border-border"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Membros da Casa</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Gerenciar quem usa o app
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => navigate("/splits")}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors border-t border-border"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Split className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Rateios</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Dividir contas de viagens
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => navigate("/settlements")}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors border-t border-border"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Acertos da Casa</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Quem deve o quê
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Automações */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
              Automações
            </h3>
            <div className="glass-card divide-y divide-border overflow-hidden">
              <button 
                onClick={() => setShowCategorizationRules(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Zap className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Regras Automáticas</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Categorize gastos automaticamente
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => setShowCategoryBudgets(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Target className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Metas por Categoria</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Limites mensais por categoria
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => navigate("/pending")}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Pendências</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Revisar itens que precisam de atenção
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Data */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
              Dados
            </h3>
            <div className="glass-card divide-y divide-border overflow-hidden">
              <button 
                onClick={() => {
                  if (csvFeature.allowed) {
                    setShowImportCSV(true);
                  } else {
                    setUpgradeFeature("CSV_IMPORT");
                    setShowUpgradeModal(true);
                  }
                }}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center relative">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <ProBadge show={!csvFeature.allowed} size="sm" iconOnly className="absolute -top-1 -right-1" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">Importar Extrato</p>
                    <ProIndicator show={!csvFeature.allowed} />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {csvFeature.allowed ? "Importar transações de planilha" : "Disponível no plano Pro"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => {
                  if (exportFeature.allowed) {
                    setShowExportReport(true);
                  } else {
                    setUpgradeFeature("DATA_EXPORT");
                    setShowUpgradeModal(true);
                  }
                }}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center relative">
                  <Download className="w-5 h-5 text-muted-foreground" />
                  <ProBadge show={!exportFeature.allowed} size="sm" iconOnly className="absolute -top-1 -right-1" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">Exportar Relatório</p>
                    <ProIndicator show={!exportFeature.allowed} />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {exportFeature.allowed ? "PDF ou Excel" : "Disponível no plano Pro"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => setShowSecurity(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Segurança</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Backup automático ativado
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
              Suporte
            </h3>
            <div className="glass-card overflow-hidden">
              <button 
                onClick={() => setShowHelp(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Ajuda</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Perguntas frequentes
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Instalar app (PWA) — sempre visível quando o app ainda não está instalado */}
          {!installed && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
                App
              </h3>
              <div className="glass-card overflow-hidden">
                {installable ? (
                  <button
                    type="button"
                    onClick={() => install()}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">Instalar app</p>
                      <p className="text-sm text-muted-foreground truncate">
                        Instale no celular ou computador
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                ) : isIOS ? (
                  <div className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Adicionar à Tela de Início</p>
                        <p className="text-sm text-muted-foreground">
                          No Safari: toque em Compartilhar → &quot;Adicionar à Tela de Início&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Instalar app</p>
                        <p className="text-sm text-muted-foreground">
                          No Chrome/Edge: menu (⋮) → &quot;Instalar aplicativo&quot; ou &quot;Instalar Campos Finance&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Panel - Only for Super Admins */}
          {isSuperAdmin && (
            <div>
              <h3 className="text-sm font-medium text-destructive mb-3 px-1">
                Administração
              </h3>
              <Link to="/admin">
                <div className="glass-card overflow-hidden border-destructive/30">
                  <div className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">Painel Admin</p>
                      <p className="text-sm text-muted-foreground truncate">
                        Área restrita do sistema
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Logout */}
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-3 p-4 text-destructive font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sair da Conta
          </button>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          CasaCampos v1.0.0
        </p>
      </div>

      {/* Edit Profile Sheet */}
      {showEditProfile && (
        <div className="fixed inset-0 z-50 animate-fade-in">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowEditProfile(false)}
          />
          
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-muted rounded-full" />
            </div>
            
            <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">Editar Perfil</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowEditProfile(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="p-4 space-y-6 pb-safe">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center overflow-hidden border-4 border-card">
                    {isUploading ? (
                      <Loader2 className="w-8 h-8 text-accent animate-spin" />
                    ) : avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-accent" />
                    )}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                    disabled={isUploading}
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAvatarSelect(e.target.files[0])}
                />
                <p className="text-sm text-muted-foreground">
                  Toque na câmera para alterar a foto
                </p>
              </div>
              
              {/* Name Input */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mobile-input"
                />
              </div>
              
              {/* Email (read-only) */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="mobile-input bg-muted/50 text-muted-foreground"
                />
              </div>
              
              {/* Save Button */}
              <Button 
                variant="accent" 
                size="lg" 
                className="w-full"
                onClick={handleSaveProfile}
                disabled={isSaving || !displayName.trim()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Other Sheets */}
      <FamilyMembersSheet 
        open={showFamilyMembers} 
        onClose={() => setShowFamilyMembers(false)} 
      />
      <ExportReportSheet 
        open={showExportReport} 
        onClose={() => setShowExportReport(false)} 
      />
      <HelpSheet 
        open={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
      <SecuritySheet 
        open={showSecurity} 
        onClose={() => setShowSecurity(false)} 
      />
      <ImportCSVSheet 
        isOpen={showImportCSV} 
        onClose={() => setShowImportCSV(false)} 
      />
      <FamilyPlanSheet 
        isOpen={showFamilyPlan} 
        onClose={() => setShowFamilyPlan(false)} 
      />
      <AccountsSheet 
        isOpen={showAccounts} 
        onClose={() => setShowAccounts(false)} 
      />
      <UpgradeModal 
        isOpen={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
        feature={upgradeFeature}
      />
      {currentHousehold?.id && (
        <>
          <CategorizationRulesSheet 
            isOpen={showCategorizationRules} 
            onClose={() => setShowCategorizationRules(false)}
            householdId={currentHousehold.id}
          />
          <CategoryBudgetsSheet 
            isOpen={showCategoryBudgets} 
            onClose={() => setShowCategoryBudgets(false)}
            householdId={currentHousehold.id}
          />
        </>
      )}
    </MobileLayout>
  );
}
