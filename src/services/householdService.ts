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
  pro_expires_at: string | null;
  source: string | null;
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
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return [];

  // IMPORTANT:
  // We must never list "all households". We only list households where the
  // current user has a membership row. This prevents "orphan" households
  // (no membership) from showing up in "Minhas famílias".
  const { data, error } = await supabase
    .from("household_members")
    .select("household:households(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  if (error) throw error;

  type Row = { household: Household | null };
  return ((data as unknown as Row[]) || [])
    .map((r) => r.household)
    .filter((h): h is Household => Boolean(h));
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

// Create a new household using the atomic function (prevents race conditions and RLS issues)
export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase
    .rpc("create_household_with_owner", { _name: name });

  if (error) throw error;

  const result = data as unknown as { success: boolean; household?: Household; error?: string };
  
  if (!result.success) {
    throw new Error(result.error || "Erro ao criar família");
  }

  if (!result.household) {
    throw new Error("Família não foi criada corretamente");
  }

  return result.household;
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

// Remove (expel) member from household — with guards
export async function removeHouseholdMember(householdId: string, targetUserId: string): Promise<void> {
  // 1) Must be authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // 2) Cannot expel yourself
  if (user.id === targetUserId) {
    throw new Error("Você não pode se expulsar. Use 'Sair da família' em vez disso.");
  }

  // 3) Requester must be admin/owner
  const requesterRole = await getUserRole(householdId);
  if (requesterRole !== "owner" && requesterRole !== "admin") {
    throw new Error("Apenas administradores podem remover membros.");
  }

  // 4) Cannot expel the last admin/owner
  const { data: admins, error: adminsErr } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .in("role", ["owner", "admin"]);

  if (adminsErr) throw adminsErr;

  const adminIds = (admins || []).map((a) => a.user_id);
  if (adminIds.includes(targetUserId) && adminIds.length <= 1) {
    throw new Error("Não é possível remover o último administrador da família.");
  }

  // 5) Execute deletion (RLS also enforces admin-only deletes)
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", targetUserId);

  if (error) throw error;
}

// Update member role with comprehensive guards:
// - Only admin/owner can change roles
// - Cannot change own role
// - Cannot demote the last admin/owner (prevents orphaned households)
export async function updateMemberRole(
  householdId: string,
  targetUserId: string,
  newRole: HouseholdRole
): Promise<void> {
  // 1) Must be authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // 2) Cannot change own role
  if (user.id === targetUserId) {
    throw new Error("Você não pode alterar seu próprio cargo.");
  }

  // 3) Requester must be admin/owner in this household
  const requesterRole = await getUserRole(householdId);
  if (requesterRole !== "owner" && requesterRole !== "admin") {
    throw new Error("Apenas administradores podem alterar cargos.");
  }

  // 4) If demoting (admin/owner → member), ensure at least one admin/owner remains
  if (newRole === "member") {
    const { data: admins, error: adminsErr } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .in("role", ["owner", "admin"]);

    if (adminsErr) throw adminsErr;

    const adminIds = (admins || []).map((a) => a.user_id);
    const remainingAdmins = adminIds.filter((id) => id !== targetUserId);
    if (remainingAdmins.length === 0) {
      throw new Error(
        "Não é possível rebaixar: esta família ficaria sem administradores."
      );
    }
  }

  // 5) Execute the update (RLS also enforces admin-only writes)
  const { error } = await supabase
    .from("household_members")
    .update({ role: newRole })
    .eq("household_id", householdId)
    .eq("user_id", targetUserId);

  if (error) throw error;
}

// Get households related to the current household (through shared members).
// Used by the Split system to restrict participant selection to "family circle".
export async function getRelatedHouseholds(
  householdId: string
): Promise<{ id: string; name: string }[]> {
  // Step 1: get user_ids of the current household members
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  if (membersError) throw membersError;

  const userIds = (members || []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  // Step 2: get all households those users belong to
  const { data: rows, error: rowsError } = await supabase
    .from("household_members")
    .select("household:households(id, name)")
    .in("user_id", userIds);

  if (rowsError) throw rowsError;

  // Step 3: deduplicate
  const uniqueMap = new Map<string, { id: string; name: string }>();
  for (const row of rows || []) {
    const h = (row as any).household as { id: string; name: string } | null;
    if (h && !uniqueMap.has(h.id)) {
      uniqueMap.set(h.id, h);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

// Get household members with display names from profiles.
// Uses RPC get_household_members_with_display_names when available (run migration 20260206210000);
// otherwise falls back to members + current user profile only.
export async function getHouseholdMembersWithProfiles(
  householdId: string
): Promise<
  (HouseholdMember & { display_name: string; email: string | null })[]
> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_household_members_with_display_names",
    { _household_id: householdId }
  );

  if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length >= 0) {
    return (rpcData as any[]).map((row) => ({
      ...row,
      email: null,
    }));
  }

  // Fallback: sem RPC (migration não aplicada) — só conseguimos o nome do usuário atual
  const { data: { user } } = await supabase.auth.getUser();
  const { data: members, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", householdId)
    .order("joined_at");

  if (error) throw error;

  let displayNameForCurrent: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    displayNameForCurrent = profile?.display_name ?? null;
  }

  return (members || []).map((row: HouseholdMember) => ({
    ...row,
    display_name:
      user && row.user_id === user.id
        ? (displayNameForCurrent || "Sem nome")
        : "Membro",
    email: null,
  }));
}

// Get household accounts
export async function getHouseholdAccounts(householdId: string): Promise<Account[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para listar contas");
  }

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
  if (!householdId) {
    throw new Error("householdId é obrigatório para criar conta");
  }

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
  householdId: string,
  updates: { name?: string; type?: string; color?: string; icon?: string; balance?: number }
): Promise<Account> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para atualizar conta");
  }

  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Account;
}

// Delete account (soft delete)
export async function deleteAccount(id: string, householdId: string): Promise<void> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para deletar conta");
  }

  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw error;
}

// Count active accounts
export async function countAccounts(householdId: string): Promise<number> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para contar contas");
  }

  const { count, error } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("is_active", true);

  if (error) throw error;
  return count || 0;
}
