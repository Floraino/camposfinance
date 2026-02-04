import { supabase } from "@/integrations/supabase/client";

export interface FamilyMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar_url: string | null;
  household_id: string;
  created_at: string;
  updated_at: string;
}

export async function getFamilyMembers(householdId: string): Promise<FamilyMember[]> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para listar membros da família");
  }

  const { data, error } = await supabase
    .from("family_members")
    .select("*")
    .eq("household_id", householdId)
    .order("name");

  if (error) throw error;
  return data || [];
}

export async function addFamilyMember(householdId: string, member: { name: string; email?: string; role?: string }): Promise<FamilyMember> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para adicionar membro");
  }

  const { data, error } = await supabase
    .from("family_members")
    .insert({
      household_id: householdId,
      household_owner_id: householdId, // legacy column, keeping for compatibility
      name: member.name,
      email: member.email,
      role: member.role || "member",
    } as unknown as { household_owner_id: string; name: string; email?: string; role?: string })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as FamilyMember;
}

export async function updateFamilyMember(id: string, householdId: string, updates: { name?: string; email?: string; role?: string }): Promise<FamilyMember> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para atualizar membro");
  }

  const { data, error } = await supabase
    .from("family_members")
    .update(updates)
    .eq("id", id)
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFamilyMember(id: string, householdId: string): Promise<void> {
  if (!householdId) {
    throw new Error("householdId é obrigatório para remover membro");
  }

  const { error } = await supabase
    .from("family_members")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw error;
}
