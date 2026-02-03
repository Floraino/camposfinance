import { supabase } from "@/integrations/supabase/client";

export interface Budget {
  id: string;
  user_id: string;
  period_type: "weekly" | "monthly";
  amount: number;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export async function getCurrentBudget(periodType: "weekly" | "monthly" = "monthly"): Promise<Budget | null> {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (periodType === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    // Weekly - start from Sunday
    const dayOfWeek = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
  }

  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("period_type", periodType)
    .eq("start_date", startDate.toISOString().split("T")[0])
    .maybeSingle();

  if (error) throw error;
  
  return data ? {
    ...data,
    period_type: data.period_type as "weekly" | "monthly",
  } : null;
}

export async function setBudget(amount: number, periodType: "weekly" | "monthly" = "monthly"): Promise<Budget> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (periodType === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    const dayOfWeek = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - dayOfWeek);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
  }

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  // Upsert - insert or update if exists
  const { data, error } = await supabase
    .from("budgets")
    .upsert({
      user_id: user.id,
      period_type: periodType,
      amount,
      start_date: startDateStr,
      end_date: endDateStr,
    }, {
      onConflict: "user_id,period_type,start_date",
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    period_type: data.period_type as "weekly" | "monthly",
  };
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
