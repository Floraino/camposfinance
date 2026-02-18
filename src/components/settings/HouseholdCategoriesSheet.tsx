import { useState, useRef } from "react";
import {
  X,
  Plus,
  Loader2,
  Edit2,
  Archive,
  ArchiveRestore,
  Trash2,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { useHouseholdCategories } from "@/hooks/useHouseholdCategories";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { HouseholdCategory } from "@/services/householdCategoriesService";
import {
  PRESET_ICON_KEYS,
  getPresetIcon,
  PRESET_ICON_LABELS,
} from "@/lib/categoryIcons";
import { uploadCategoryIcon } from "@/lib/categoryIconUpload";
import { getCategoryOptionsForPicker } from "@/lib/categoryResolvers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEFAULT_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#F97316",
  "#10B981",
  "#3B82F6",
  "#14B8A6",
  "#EAB308",
];

interface HouseholdCategoriesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  householdId: string;
}

export function HouseholdCategoriesSheet({
  isOpen,
  onClose,
  householdId,
}: HouseholdCategoriesSheetProps) {
  const { toast } = useToast();
  const {
    categories,
    isLoading,
    createCategory,
    updateCategory,
    archiveCategory,
    deletePermanently,
    reassignAndDelete,
    getCategoryUsage,
    isCreating,
    isUpdating,
    isArchiving,
    isDeleting,
    isReassigning,
  } = useHouseholdCategories(householdId, { includeArchived: true });

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [newIconKey, setNewIconKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIconKey, setEditIconKey] = useState<string | null>(null);
  const [editIconType, setEditIconType] = useState<"preset" | "upload" | null>(null);
  const [editIconUrl, setEditIconUrl] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>("");

  const startEdit = (c: HouseholdCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color ?? DEFAULT_COLORS[0]);
    setEditIconKey(c.icon_type === "preset" ? (c.icon_key ?? null) : null);
    setEditIconType(c.icon_type ?? null);
    setEditIconUrl(c.icon_type === "upload" && c.icon_url ? c.icon_url : null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("");
    setEditIconKey(null);
    setEditIconType(null);
    setEditIconUrl(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (name.length > 32) {
      toast({ title: "Nome com no máximo 32 caracteres", variant: "destructive" });
      return;
    }
    try {
      await createCategory({
        name,
        color: newColor,
        icon_type: newIconKey ? "preset" : null,
        icon_key: newIconKey ?? undefined,
      });
      toast({ title: "Categoria criada!" });
      setNewName("");
      setNewColor(DEFAULT_COLORS[0]);
      setNewIconKey(null);
      setShowAddForm(false);
    } catch (e) {
      toast({
        title: "Erro ao criar categoria",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    try {
      await updateCategory({
        id: editingId,
        input: {
          name,
          color: editColor,
          icon_type: editIconType,
          icon_key: editIconType === "preset" ? (editIconKey ?? undefined) : undefined,
          icon_url: editIconType === "upload" && editIconUrl ? editIconUrl : undefined,
        },
      });
      toast({ title: "Categoria atualizada!" });
      cancelEdit();
    } catch (e) {
      toast({
        title: "Erro ao atualizar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleArchive = async (c: HouseholdCategory) => {
    try {
      if (c.is_archived) {
        await updateCategory({ id: c.id, input: { is_archived: false } });
        toast({ title: "Categoria restaurada" });
      } else {
        await archiveCategory(c.id);
        toast({ title: "Categoria arquivada" });
      }
    } catch (e) {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handleDeleteClick = async (c: HouseholdCategory) => {
    try {
      const usage = await getCategoryUsage(c.id);
      if (usage.transactions > 0 || usage.rules > 0) {
        toast({
          title: "Categoria em uso",
          description: `${usage.transactions} transação(ões) e ${usage.rules} regra(s). Use "Reatribuir e excluir" para mover para outra categoria e depois excluir.`,
          variant: "destructive",
        });
        setReassignId(c.id);
        setReassignTarget("");
      } else {
        setConfirmDeleteId(c.id);
      }
    } catch {
      toast({ title: "Erro ao verificar uso", variant: "destructive" });
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deletePermanently(confirmDeleteId);
      toast({ title: "Categoria excluída permanentemente" });
      setConfirmDeleteId(null);
      if (editingId === confirmDeleteId) cancelEdit();
    } catch (e) {
      toast({
        title: "Erro ao excluir",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleReassignAndDelete = async () => {
    if (!reassignId || !reassignTarget) {
      toast({ title: "Escolha a categoria de destino", variant: "destructive" });
      return;
    }
    try {
      await reassignAndDelete({ id: reassignId, targetCategory: reassignTarget });
      toast({ title: "Transações e regras reatribuídas; categoria excluída" });
      setReassignId(null);
      setReassignTarget("");
      if (editingId === reassignId) cancelEdit();
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleIconUpload = async (categoryId: string, file: File) => {
    if (!householdId) return;
    setUploadingIcon(true);
    try {
      const url = await uploadCategoryIcon(householdId, categoryId, file);
      setEditIconType("upload");
      setEditIconKey(null);
      setEditIconUrl(url);
    } catch (e) {
      toast({
        title: "Erro no upload",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUploadingIcon(false);
      fileInputRef.current?.value && (fileInputRef.current.value = "");
    }
  };

  const reassignOptions = getCategoryOptionsForPicker(categories, true).filter(
    (opt) => opt.value !== (reassignId ? `custom:${reassignId}` : "")
  );

  if (!isOpen) return null;

  const activeCategories = categories.filter((c) => !c.is_archived);
  const archivedCategories = categories.filter((c) => c.is_archived);

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-muted rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Categorias da família
            </h2>
            <p className="text-sm text-muted-foreground">
              Categorias personalizadas só aparecem nesta família
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4 pb-safe">
          {showAddForm ? (
            <div className="glass-card p-4 space-y-4">
              <Label>Nova categoria</Label>
              <Input
                placeholder="Ex: Pet, Assinaturas..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={32}
              />
              <div>
                <Label className="mb-2 block">Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setNewColor(hex)}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-all",
                        newColor === hex
                          ? "border-primary scale-110"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Ícone (opcional)</Label>
                <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setNewIconKey(null)}
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-lg border-2 transition-all",
                      newIconKey === null
                        ? "border-primary bg-primary/10"
                        : "border-transparent bg-muted/50"
                    )}
                    title="Nenhum"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {PRESET_ICON_KEYS.map((key) => {
                    const Icon = getPresetIcon(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewIconKey(key)}
                        className={cn(
                          "flex items-center justify-center w-9 h-9 rounded-lg border-2 transition-all",
                          newIconKey === key
                            ? "border-primary bg-primary/10"
                            : "border-transparent hover:bg-muted/50"
                        )}
                        title={PRESET_ICON_LABELS[key] ?? key}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreate}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Criar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4" />
              Nova categoria
            </Button>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {activeCategories.length === 0 &&
              archivedCategories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma categoria personalizada. Crie uma para usar em
                  lançamentos, regras e relatórios.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCategories.map((c) => (
                    <div
                      key={c.id}
                      className="glass-card p-4 flex items-center gap-3"
                    >
                      {editingId === c.id ? (
                        <div className="flex-1 space-y-3">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={32}
                            className="h-9"
                          />
                          <div className="flex gap-2 flex-wrap">
                            {DEFAULT_COLORS.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setEditColor(hex)}
                                className={cn(
                                  "w-6 h-6 rounded-full border-2 transition-all",
                                  editColor === hex
                                    ? "border-primary scale-110"
                                    : "border-transparent"
                                )}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              Ícone
                            </Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="grid grid-cols-6 gap-1 max-h-24 overflow-y-auto">
                                {PRESET_ICON_KEYS.map((key) => {
                                  const Icon = getPresetIcon(key);
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => {
                                        setEditIconType("preset");
                                        setEditIconKey(key);
                                        setEditIconUrl(null);
                                      }}
                                      className={cn(
                                        "flex items-center justify-center w-8 h-8 rounded border transition-all",
                                        editIconType === "preset" &&
                                          editIconKey === key
                                          ? "border-primary bg-primary/10"
                                          : "border-transparent"
                                      )}
                                    >
                                      <Icon className="w-4 h-4" />
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/png,image/webp,image/svg+xml"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleIconUpload(c.id, f);
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingIcon}
                                  onClick={() =>
                                    fileInputRef.current?.click()
                                  }
                                >
                                  {uploadingIcon ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <ImagePlus className="w-4 h-4" />
                                  )}{" "}
                                  Upload
                                </Button>
                                {editIconType === "upload" && editIconUrl && (
                                  <div className="flex items-center gap-1">
                                    <img
                                      src={editIconUrl}
                                      alt=""
                                      className="w-6 h-6 rounded object-cover"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditIconType(null);
                                        setEditIconKey(null);
                                        setEditIconUrl(null);
                                      }}
                                    >
                                      Remover
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleUpdate}
                              disabled={isUpdating}
                            >
                              {isUpdating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                "Salvar"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteClick(c)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}{" "}
                              Excluir permanentemente
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <CategoryBadge
                            category={`custom:${c.id}`}
                            size="md"
                            customCategories={categories}
                          />
                          <div className="flex-1 min-w-0" />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startEdit(c)}
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleArchive(c)}
                            disabled={isArchiving}
                            title="Arquivar"
                          >
                            <Archive className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteClick(c)}
                            disabled={isDeleting}
                            title="Excluir permanentemente"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  {archivedCategories.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground pt-2">
                        Arquivadas
                      </p>
                      {archivedCategories.map((c) => (
                        <div
                          key={c.id}
                          className="glass-card p-4 flex items-center gap-3 opacity-75"
                        >
                          <CategoryBadge
                            category={`custom:${c.id}`}
                            size="md"
                            customCategories={categories}
                          />
                          <div className="flex-1 min-w-0" />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleArchive(c)}
                            disabled={isArchiving}
                            title="Restaurar"
                          >
                            <ArchiveRestore className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteClick(c)}
                            disabled={isDeleting}
                            title="Excluir permanentemente"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmar exclusão permanente */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta categoria será removida para sempre. Transações e regras não
              estão usando ela. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reatribuir e excluir */}
      <AlertDialog
        open={!!reassignId}
        onOpenChange={(open) => !open && setReassignId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reatribuir e excluir</AlertDialogTitle>
            <AlertDialogDescription>
              Esta categoria está em uso. Escolha para qual categoria mover
              transações e regras; em seguida a categoria será excluída
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-sm">Categoria de destino</Label>
            <select
              value={reassignTarget}
              onChange={(e) => setReassignTarget(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {reassignOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReassignAndDelete}
              disabled={!reassignTarget || isReassigning}
            >
              {isReassigning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}{" "}
              Reatribuir e excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
