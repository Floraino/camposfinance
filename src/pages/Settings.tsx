import { useState, useRef, useEffect } from "react";
import { ChevronRight, Moon, Bell, Shield, Users, Download, Upload, HelpCircle, LogOut, User, Camera, X, Loader2 } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FamilyMembersSheet } from "@/components/settings/FamilyMembersSheet";
import { ExportReportSheet } from "@/components/settings/ExportReportSheet";
import { HelpSheet } from "@/components/settings/HelpSheet";
import { SecuritySheet } from "@/components/settings/SecuritySheet";
import { ImportCSVSheet } from "@/components/transactions/ImportCSVSheet";

export default function Settings() {
  const { profile, user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showFamilyMembers, setShowFamilyMembers] = useState(false);
  const [showExportReport, setShowExportReport] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [darkMode, setDarkMode] = useState(resolvedTheme === "dark");
  const [notifications, setNotifications] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            <div className="glass-card overflow-hidden">
              <button 
                onClick={() => setShowFamilyMembers(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
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
            </div>
          </div>

          {/* Data */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
              Dados
            </h3>
            <div className="glass-card divide-y divide-border overflow-hidden">
              <button 
                onClick={() => setShowImportCSV(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Importar CSV</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Importar transações de planilha
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => setShowExportReport(true)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Download className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Exportar Relatório</p>
                  <p className="text-sm text-muted-foreground truncate">
                    PDF ou Excel
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
    </MobileLayout>
  );
}
