import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Parse request body
    const { householdId } = await req.json();
    if (!householdId) throw new Error("Household ID is required");
    logStep("Checking subscription for household", { householdId });

    // Get household plan
    const { data: planData, error: planError } = await supabaseAdmin
      .from("household_plans")
      .select("*")
      .eq("household_id", householdId)
      .single();

    if (planError) {
      logStep("No plan found for household", { householdId });
      return new Response(JSON.stringify({
        plan: "BASIC",
        status: "active",
        subscribed: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If there's a Stripe subscription, verify it's still active
    if (planData.stripe_subscription_id && planData.source === "subscription") {
      logStep("Verifying Stripe subscription", { subscriptionId: planData.stripe_subscription_id });
      
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      
      try {
        const subscription = await stripe.subscriptions.retrieve(planData.stripe_subscription_id);
        
        const isActive = ["active", "trialing"].includes(subscription.status);
        const newPlan = isActive ? "PRO" : "BASIC";
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
        
        logStep("Stripe subscription status", { 
          status: subscription.status, 
          isActive, 
          periodEnd 
        });

        // Update local plan if status changed
        if (newPlan !== planData.plan || periodEnd !== planData.pro_expires_at) {
          await supabaseAdmin
            .from("household_plans")
            .update({
              plan: newPlan,
              status: subscription.status === "past_due" ? "past_due" : 
                      subscription.status === "canceled" ? "cancelled" : "active",
              pro_expires_at: isActive ? periodEnd : null,
              updated_at: new Date().toISOString(),
            })
            .eq("household_id", householdId);
          
          logStep("Updated household plan", { newPlan, periodEnd });
        }

        return new Response(JSON.stringify({
          plan: newPlan,
          status: subscription.status,
          subscribed: isActive,
          pro_expires_at: isActive ? periodEnd : null,
          subscription_id: planData.stripe_subscription_id,
          provider: "STRIPE",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (stripeError) {
        logStep("Stripe error, falling back to local data", { error: stripeError });
      }
    }

    // Check coupon/admin-granted PRO expiration
    if (planData.plan === "PRO" && planData.pro_expires_at) {
      const expiresAt = new Date(planData.pro_expires_at);
      if (expiresAt < new Date()) {
        // PRO expired, downgrade to BASIC
        await supabaseAdmin
          .from("household_plans")
          .update({
            plan: "BASIC",
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);
        
        logStep("PRO expired, downgraded to BASIC");
        
        return new Response(JSON.stringify({
          plan: "BASIC",
          status: "expired",
          subscribed: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Return current plan data
    return new Response(JSON.stringify({
      plan: planData.plan,
      status: planData.status,
      subscribed: planData.plan === "PRO",
      pro_expires_at: planData.pro_expires_at,
      provider: planData.source || "unknown",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
