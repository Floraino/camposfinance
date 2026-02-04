import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface CategoryBudget {
  id: string;
  household_id: string;
  category: CategoryType;
  amount: number;
  month: number;
  year: number;
  alert_threshold: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryBudgetWithSpending extends CategoryBudget {
  spent: number;
  percentage: number;
  status: "safe" | "warning" | "exceeded";
}

export interface NewCategoryBudget {
  category: CategoryType;
  amount: number;
  month?: number;
  year?: number;
  alert_threshold?: number;
}

export async function getCategoryBudgets(
  householdId: string,
  month?: number,
  year?: number
): Promise<CategoryBudget[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  const { data, error } = await supabase
    .from("category_budgets")
    .select("*")
    .eq("household_id", householdId)
    .eq("month", targetMonth)
    .eq("year", targetYear);

  if (error) throw error;

  return (data || []).map(b => ({
    ...b,
    category: b.category as CategoryType,
    amount: Number(b.amount),
  }));
}

export async function getCategoryBudgetsWithSpending(
  householdId: string,
  month?: number,
  year?: number
): Promise<CategoryBudgetWithSpending[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  // Get budgets
  const budgets = await getCategoryBudgets(householdId, targetMonth, targetYear);

  // Get spending by category
  const { data: spending, error: spendingError } = await supabase
    .rpc("get_category_spending", {
      _household_id: householdId,
      _month: targetMonth,
      _year: targetYear,
    });

  if (spendingError) throw spendingError;

  const spendingMap = new Map<string, number>();
  (spending || []).forEach((s: { category: string; total_spent: number }) => {
    spendingMap.set(s.category, Number(s.total_spent));
  });

  return budgets.map(budget => {
    const spent = spendingMap.get(budget.category) || 0;
    const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    let status: "safe" | "warning" | "exceeded" = "safe";
    
    if (percentage >= 100) {
      status = "exceeded";
    } else if (percentage >= budget.alert_threshold) {
      status = "warning";
    }

    return {
      ...budget,
      spent,
      percentage,
      status,
    };
  });
}

export async function setCategoryBudget(
  householdId: string,
  budget: NewCategoryBudget
): Promise<CategoryBudget> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const now = new Date();
  const targetMonth = budget.month ?? now.getMonth() + 1;
  const targetYear = budget.year ?? now.getFullYear();

  const { data, error } = await supabase
    .from("category_budgets")
    .upsert({
      household_id: householdId,
      category: budget.category,
      amount: budget.amount,
      month: targetMonth,
      year: targetYear,
      alert_threshold: budget.alert_threshold ?? 80,
      created_by: user.id,
    }, {
      onConflict: "household_id,category,month,year",
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    category: data.category as CategoryType,
    amount: Number(data.amount),
  };
}

export async function deleteCategoryBudget(
  budgetId: string,
  householdId: string
): Promise<void> {
  if (!householdId) {
    throw new Error("householdId é obrigatório");
  }

  const { error } = await supabase
    .from("category_budgets")
    .delete()
    .eq("id", budgetId)
    .eq("household_id", householdId);

  if (error) throw error;
}

// Get all categories with alerts (for notifications)
export async function getCategoryAlerts(
  householdId: string,
  month?: number,
  year?: number
): Promise<CategoryBudgetWithSpending[]> {
  const budgets = await getCategoryBudgetsWithSpending(householdId, month, year);
  return budgets.filter(b => b.status === "warning" || b.status === "exceeded");
}
