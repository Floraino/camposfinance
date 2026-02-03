import { supabase } from "@/integrations/supabase/client";

export interface FamilyMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar_url: string | null;
  household_owner_id: string;
  created_at: string;
  updated_at: string;
}

export async function getFamilyMembers(): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from("family_members")
    .select("*")
    .order("name");

  if (error) throw error;
  return data || [];
}

export async function addFamilyMember(member: { name: string; email?: string; role?: string }): Promise<FamilyMember> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("family_members")
    .insert({
      household_owner_id: user.id,
      name: member.name,
      email: member.email,
      role: member.role || "member",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFamilyMember(id: string): Promise<void> {
  const { error } = await supabase
    .from("family_members")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
