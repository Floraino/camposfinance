import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  getHouseholdCategories,
  createHouseholdCategory,
  updateHouseholdCategory,
  archiveHouseholdCategory,
  deleteHouseholdCategoryPermanently,
  reassignAndDeleteHouseholdCategory,
  getCategoryUsage,
  type HouseholdCategory,
  type CreateHouseholdCategoryInput,
  type UpdateHouseholdCategoryInput,
} from "@/services/householdCategoriesService";

export const HOUSEHOLD_CATEGORIES_QUERY_KEY = "household-categories";

export function useHouseholdCategories(
  householdId: string | undefined,
  options?: { includeArchived?: boolean }
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [HOUSEHOLD_CATEGORIES_QUERY_KEY, householdId, options?.includeArchived ?? false],
    queryFn: () =>
      householdId
        ? getHouseholdCategories(householdId, { includeArchived: options?.includeArchived })
        : Promise.resolve([]),
    enabled: !!householdId,
  });

  const invalidate = () => {
    if (householdId) {
      queryClient.invalidateQueries({ queryKey: [HOUSEHOLD_CATEGORIES_QUERY_KEY, householdId, true] });
      queryClient.invalidateQueries({ queryKey: [HOUSEHOLD_CATEGORIES_QUERY_KEY, householdId, false] });
    }
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateHouseholdCategoryInput) =>
      householdId ? createHouseholdCategory(householdId, input) : Promise.reject(new Error("Sem família")),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHouseholdCategoryInput }) =>
      householdId ? updateHouseholdCategory(householdId, id, input) : Promise.reject(new Error("Sem família")),
    onSuccess: () => invalidate(),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      householdId ? archiveHouseholdCategory(householdId, id) : Promise.reject(new Error("Sem família")),
    onSuccess: () => invalidate(),
  });

  const deletePermanentlyMutation = useMutation({
    mutationFn: (id: string) =>
      householdId
        ? deleteHouseholdCategoryPermanently(householdId, id)
        : Promise.reject(new Error("Sem família")),
    onSuccess: () => invalidate(),
  });

  const reassignAndDeleteMutation = useMutation({
    mutationFn: ({ id, targetCategory }: { id: string; targetCategory: string }) =>
      householdId
        ? reassignAndDeleteHouseholdCategory(householdId, id, targetCategory)
        : Promise.reject(new Error("Sem família")),
    onSuccess: () => invalidate(),
  });

  return {
    categories: (query.data ?? []) as HouseholdCategory[],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    archiveCategory: archiveMutation.mutateAsync,
    deletePermanently: deletePermanentlyMutation.mutateAsync,
    reassignAndDelete: reassignAndDeleteMutation.mutateAsync,
    getCategoryUsage: householdId
      ? (id: string) => getCategoryUsage(householdId, id)
      : () => Promise.resolve({ transactions: 0, rules: 0 }),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isDeleting: deletePermanentlyMutation.isPending,
    isReassigning: reassignAndDeleteMutation.isPending,
  };
}
