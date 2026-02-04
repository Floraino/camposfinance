import { supabase } from "@/integrations/supabase/client";

export type SplitEventStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type SplitPaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface SplitEvent {
  id: string;
  owner_household_id: string;
  created_by_user_id: string;
  title: string;
  description: string | null;
  total_amount: number;
  total_shares: number;
  currency: string;
  status: SplitEventStatus;
  created_at: string;
  updated_at: string;
}

export interface SplitParticipant {
  id: string;
  split_event_id: string;
  participant_household_id: string;
  payer_user_id: string | null;
  shares: number;
  amount_calculated: number;
  payment_status: SplitPaymentStatus;
  paid_amount: number;
  paid_at: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  household_name?: string;
}

export interface CreateSplitEventInput {
  title: string;
  description?: string;
  total_amount: number;
  total_shares: number;
  owner_household_id: string;
}

export interface CreateParticipantInput {
  split_event_id: string;
  participant_household_id: string;
  shares: number;
  payer_user_id?: string;
  notes?: string;
}

// Get all split events accessible to the current user for a household
export async function getSplitEvents(householdId: string): Promise<SplitEvent[]> {
  const { data, error } = await supabase
    .from("split_events")
    .select("*")
    .or(`owner_household_id.eq.${householdId}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as SplitEvent[];
}

// Get a single split event by ID
export async function getSplitEvent(id: string): Promise<SplitEvent | null> {
  const { data, error } = await supabase
    .from("split_events")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as SplitEvent;
}

// Create a new split event
export async function createSplitEvent(input: CreateSplitEventInput): Promise<SplitEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("split_events")
    .insert({
      title: input.title,
      description: input.description || null,
      total_amount: input.total_amount,
      total_shares: input.total_shares,
      owner_household_id: input.owner_household_id,
      created_by_user_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SplitEvent;
}

// Update a split event
export async function updateSplitEvent(
  id: string,
  updates: Partial<Pick<SplitEvent, "title" | "description" | "total_amount" | "total_shares" | "status">>
): Promise<SplitEvent> {
  const { data, error } = await supabase
    .from("split_events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SplitEvent;
}

// Delete a split event
export async function deleteSplitEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from("split_events")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// Get participants for a split event
export async function getSplitParticipants(splitEventId: string): Promise<SplitParticipant[]> {
  const { data, error } = await supabase
    .from("split_participants")
    .select(`
      *,
      households:participant_household_id (name)
    `)
    .eq("split_event_id", splitEventId)
    .order("shares", { ascending: false });

  if (error) throw error;
  
  return (data || []).map((p: any) => ({
    ...p,
    household_name: p.households?.name,
  })) as unknown as SplitParticipant[];
}

// Add a participant to a split event
export async function addSplitParticipant(input: CreateParticipantInput): Promise<SplitParticipant> {
  const { data, error } = await supabase
    .from("split_participants")
    .insert({
      split_event_id: input.split_event_id,
      participant_household_id: input.participant_household_id,
      shares: input.shares,
      payer_user_id: input.payer_user_id || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SplitParticipant;
}

// Update a participant
export async function updateSplitParticipant(
  id: string,
  updates: Partial<Pick<SplitParticipant, "shares" | "payer_user_id" | "payment_status" | "paid_amount" | "paid_at" | "payment_method" | "payment_proof_url" | "notes">>
): Promise<SplitParticipant> {
  const { data, error } = await supabase
    .from("split_participants")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SplitParticipant;
}

// Remove a participant
export async function removeSplitParticipant(id: string): Promise<void> {
  const { error } = await supabase
    .from("split_participants")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// Calculate totals for a split event
export async function getSplitEventSummary(splitEventId: string): Promise<{
  totalShares: number;
  allocatedShares: number;
  totalPaid: number;
  totalAmount: number;
  remainingAmount: number;
}> {
  const [event, participants] = await Promise.all([
    getSplitEvent(splitEventId),
    getSplitParticipants(splitEventId),
  ]);

  if (!event) throw new Error("Evento não encontrado");

  const allocatedShares = participants.reduce((sum, p) => sum + p.shares, 0);
  const totalPaid = participants.reduce((sum, p) => sum + p.paid_amount, 0);

  return {
    totalShares: event.total_shares,
    allocatedShares,
    totalAmount: event.total_amount,
    totalPaid,
    remainingAmount: event.total_amount - totalPaid,
  };
}

// Mark participant as paid
export async function markParticipantAsPaid(
  participantId: string,
  paidAmount: number,
  paymentMethod?: string
): Promise<SplitParticipant> {
  const participant = await supabase
    .from("split_participants")
    .select("amount_calculated")
    .eq("id", participantId)
    .single();

  if (participant.error) throw participant.error;

  const amountCalculated = participant.data.amount_calculated as number;
  const paymentStatus: SplitPaymentStatus = 
    paidAmount >= amountCalculated ? "PAID" : 
    paidAmount > 0 ? "PARTIAL" : "UNPAID";

  return updateSplitParticipant(participantId, {
    paid_amount: paidAmount,
    payment_status: paymentStatus,
    paid_at: new Date().toISOString(),
    payment_method: paymentMethod || null,
  });
}
