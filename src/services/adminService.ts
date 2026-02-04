import { supabase } from "@/integrations/supabase/client";

// Check if current user is super admin
export async function checkIsSuperAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("is_super_admin", {
    _user_id: user.id,
  });

  if (error) {
    console.error("Error checking admin status:", error);
    return false;
  }

  return data === true;
}

// Dashboard stats
export interface AdminStats {
  totalHouseholds: number;
  totalUsers: number;
  proHouseholds: number;
  activeCoupons: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [households, users, proPlans, coupons] = await Promise.all([
    supabase.from("households").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("household_plans").select("id", { count: "exact", head: true }).eq("plan", "PRO").eq("status", "active"),
    supabase.from("coupons").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return {
    totalHouseholds: households.count || 0,
    totalUsers: users.count || 0,
    proHouseholds: proPlans.count || 0,
    activeCoupons: coupons.count || 0,
  };
}

// Households
export interface AdminHousehold {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  plan?: {
    plan: string;
    status: string;
    pro_expires_at: string | null;
    source: string | null;
  };
  members_count?: number;
  accounts_count?: number;
  transactions_count?: number;
}

export async function getAdminHouseholds(search?: string): Promise<AdminHousehold[]> {
  let query = supabase
    .from("households")
    .select("*")
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query.limit(100);
  if (error) throw error;

  // Fetch additional data for each household
  const householdsWithData = await Promise.all(
    (data || []).map(async (household) => {
      const [plan, members, accounts, transactions] = await Promise.all([
        supabase.from("household_plans").select("plan, status, pro_expires_at, source").eq("household_id", household.id).single(),
        supabase.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", household.id),
        supabase.from("accounts").select("id", { count: "exact", head: true }).eq("household_id", household.id).eq("is_active", true),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("household_id", household.id),
      ]);

      return {
        ...household,
        plan: plan.data || undefined,
        members_count: members.count || 0,
        accounts_count: accounts.count || 0,
        transactions_count: transactions.count || 0,
      };
    })
  );

  return householdsWithData;
}

// Grant Pro days
export async function grantProDays(householdId: string, days: number): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado" };

  const { data, error } = await supabase.rpc("admin_grant_pro_days", {
    _household_id: householdId,
    _days: days,
    _admin_id: user.id,
  });

  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

// Set plan
export async function setHouseholdPlan(
  householdId: string,
  plan: "BASIC" | "PRO",
  expiresAt?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado" };

  const { data, error } = await supabase.rpc("admin_set_plan", {
    _household_id: householdId,
    _plan: plan,
    _expires_at: expiresAt || null,
    _admin_id: user.id,
  });

  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

// Users
export interface AdminUser {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_blocked: boolean;
  created_at: string;
  role?: string;
  households_count?: number;
}

export async function getAdminUsers(search?: string): Promise<AdminUser[]> {
  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  const { data, error } = await query.limit(100);
  if (error) throw error;

  // Fetch roles and household counts
  const usersWithData = await Promise.all(
    (data || []).map(async (profile) => {
      const [role, households] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", profile.user_id).single(),
        supabase.from("household_members").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id),
      ]);

      return {
        ...profile,
        role: role.data?.role || "user",
        households_count: households.count || 0,
      };
    })
  );

  return usersWithData;
}

// Block/unblock user
export async function setUserBlocked(userId: string, blocked: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("profiles")
    .update({ is_blocked: blocked })
    .eq("user_id", userId);

  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: blocked ? "block_user" : "unblock_user",
    target_type: "user",
    target_id: userId,
    metadata: {},
  });
}

// Set user role
export async function setUserRole(userId: string, role: "super_admin" | "user"): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // Upsert role
  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });

  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: role === "super_admin" ? "promote_admin" : "revoke_admin",
    target_type: "user",
    target_id: userId,
    metadata: { new_role: role },
  });
}

// Coupons
export interface AdminCoupon {
  id: string;
  code: string;
  type: string;
  days_granted: number;
  max_redemptions: number;
  redeemed_count: number;
  expires_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export async function getAdminCoupons(): Promise<AdminCoupon[]> {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createCoupon(coupon: {
  code: string;
  days_granted: number;
  max_redemptions: number;
  expires_at?: string;
  notes?: string;
}): Promise<AdminCoupon> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      code: coupon.code.toUpperCase(),
      days_granted: coupon.days_granted,
      max_redemptions: coupon.max_redemptions,
      expires_at: coupon.expires_at || null,
      notes: coupon.notes || null,
      created_by_admin_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: "create_coupon",
    target_type: "coupon",
    target_id: data.id,
    metadata: { code: data.code, days_granted: data.days_granted },
  });

  return data;
}

export async function deactivateCoupon(couponId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("coupons")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", couponId);

  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: "deactivate_coupon",
    target_type: "coupon",
    target_id: couponId,
    metadata: {},
  });
}

// Audit logs
export interface AuditLog {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  admin_name?: string;
}

export async function getAuditLogs(limit = 50): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Fetch admin names
  const adminIds = [...new Set((data || []).map((log) => log.admin_user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", adminIds);

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.display_name]));

  return (data || []).map((log) => ({
    ...log,
    metadata: (log.metadata as Record<string, unknown>) || {},
    admin_name: profileMap.get(log.admin_user_id) || "Admin",
  }));
}

// Generate coupon code
export function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Delete household (cascade deletes members, plans, transactions, accounts)
export async function deleteHousehold(householdId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // Delete related data first (cascade may not be set up)
  await supabase.from("transactions").delete().eq("household_id", householdId);
  await supabase.from("accounts").delete().eq("household_id", householdId);
  await supabase.from("family_members").delete().eq("household_id", householdId);
  await supabase.from("budgets").delete().eq("household_id", householdId);
  await supabase.from("categories").delete().eq("household_id", householdId);
  await supabase.from("household_invites").delete().eq("household_id", householdId);
  await supabase.from("household_join_requests").delete().eq("household_id", householdId);
  await supabase.from("coupon_redemptions").delete().eq("household_id", householdId);
  await supabase.from("household_plans").delete().eq("household_id", householdId);
  await supabase.from("household_members").delete().eq("household_id", householdId);

  const { error } = await supabase.from("households").delete().eq("id", householdId);
  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: "delete_household",
    target_type: "household",
    target_id: householdId,
    metadata: {},
  });
}

// Update household name
export async function updateHouseholdName(householdId: string, name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("households")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", householdId);

  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: "update_household",
    target_type: "household",
    target_id: householdId,
    metadata: { new_name: name },
  });
}

// Delete user profile (does not delete auth user, just profile)
export async function deleteUserProfile(userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // Remove from all households
  await supabase.from("household_members").delete().eq("user_id", userId);
  
  // Delete user preferences
  await supabase.from("user_preferences").delete().eq("user_id", userId);
  
  // Delete user roles
  await supabase.from("user_roles").delete().eq("user_id", userId);

  const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: "delete_user",
    target_type: "user",
    target_id: userId,
    metadata: {},
  });
}

// Update user display name
export async function updateUserDisplayName(userId: string, displayName: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) throw error;

  // Log action
  await supabase.from("admin_audit_logs").insert({
    admin_user_id: user.id,
    action_type: "update_user",
    target_type: "user",
    target_id: userId,
    metadata: { new_display_name: displayName },
  });
}
