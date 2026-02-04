import { supabase } from "@/integrations/supabase/client";

export type PlanType = "BASIC" | "PRO";
export type PlanStatus = "active" | "cancelled" | "expired" | "trial";
export type HouseholdRole = "owner" | "admin" | "member";

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdPlan {
  id: string;
  household_id: string;
  plan: PlanType;
  status: PlanStatus;
  started_at: string;
  expires_at: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  household_id: string;
  name: string;
  type: string;
  balance: number;
  color: string;
  icon: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Get all households the user is a member of
export async function getUserHouseholds(): Promise<Household[]> {
  const { data, error } = await supabase
    .from("households")
    .select("*")
    .order("created_at");

  if (error) throw error;
  return data || [];
}

// Get a single household by ID
export async function getHousehold(id: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from("households")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

// Create a new household
export async function createHousehold(name: string): Promise<Household> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  // Create the household
  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({ name, created_by: user.id })
    .select()
    .single();

  if (householdError) throw householdError;

  // Add user as owner
  const { error: memberError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) throw memberError;

  // Create BASIC plan for the household
  const { error: planError } = await supabase
    .from("household_plans")
    .insert({
      household_id: household.id,
      plan: "BASIC",
      status: "active",
    });

  if (planError) throw planError;

  return household;
}

// Update household name
export async function updateHousehold(id: string, name: string): Promise<Household> {
  const { data, error } = await supabase
    .from("households")
    .update({ name })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete a household
export async function deleteHousehold(id: string): Promise<void> {
  const { error } = await supabase
    .from("households")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// Get household plan
export async function getHouseholdPlan(householdId: string): Promise<HouseholdPlan | null> {
  const { data, error } = await supabase
    .from("household_plans")
    .select("*")
    .eq("household_id", householdId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as HouseholdPlan;
}

// Get household members
export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", householdId)
    .order("joined_at");

  if (error) throw error;
  return data as unknown as HouseholdMember[] || [];
}

// Get user's role in a household
export async function getUserRole(householdId: string): Promise<HouseholdRole | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .single();

  if (error) return null;
  return data.role as HouseholdRole;
}

// Check if user is admin/owner
export async function isHouseholdAdmin(householdId: string): Promise<boolean> {
  const role = await getUserRole(householdId);
  return role === "owner" || role === "admin";
}

// Add member to household
export async function addHouseholdMember(
  householdId: string,
  userId: string,
  role: HouseholdRole = "member"
): Promise<HouseholdMember> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("household_members")
    .insert({
      household_id: householdId,
      user_id: userId,
      role,
      invited_by: user?.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as HouseholdMember;
}

// Remove member from household
export async function removeHouseholdMember(householdId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) throw error;
}

// Update member role
export async function updateMemberRole(
  householdId: string,
  userId: string,
  role: HouseholdRole
): Promise<void> {
  const { error } = await supabase
    .from("household_members")
    .update({ role })
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) throw error;
}

// Get household accounts
export async function getHouseholdAccounts(householdId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data as unknown as Account[] || [];
}

// Create account
export async function createAccount(
  householdId: string,
  account: { name: string; type?: string; color?: string; icon?: string }
): Promise<Account> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      household_id: householdId,
      name: account.name,
      type: account.type || "checking",
      color: account.color || "#6366F1",
      icon: account.icon || "wallet",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Account;
}

// Update account
export async function updateAccount(
  id: string,
  updates: { name?: string; type?: string; color?: string; icon?: string; balance?: number }
): Promise<Account> {
  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Account;
}

// Delete account (soft delete)
export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
}

// Count active accounts
export async function countAccounts(householdId: string): Promise<number> {
  const { count, error } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("is_active", true);

  if (error) throw error;
  return count || 0;
}
