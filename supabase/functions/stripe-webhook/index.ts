import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  
  if (!stripeKey) {
    logStep("ERROR", { message: "STRIPE_SECRET_KEY is not set" });
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    const body = await req.text();
    
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      // For development without webhook secret
      event = JSON.parse(body) as Stripe.Event;
      logStep("WARNING: Processing webhook without signature verification");
    }
  } catch (err) {
    logStep("Webhook signature verification failed", { error: err });
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  logStep("Webhook received", { type: event.type, id: event.id });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const householdId = session.metadata?.household_id;
        
        if (!householdId) {
          logStep("No household_id in session metadata", { sessionId: session.id });
          break;
        }

        logStep("Checkout completed", { householdId, customerId: session.customer });

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Update household plan to PRO
        const { error } = await supabaseAdmin
          .from("household_plans")
          .update({
            plan: "PRO",
            status: "active",
            source: "subscription",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            pro_expires_at: periodEnd,
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);

        if (error) {
          logStep("Failed to update household plan", { error, householdId });
        } else {
          logStep("Household upgraded to PRO", { householdId, periodEnd });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const householdId = subscription.metadata?.household_id;
        
        if (!householdId) {
          logStep("No household_id in subscription metadata", { subscriptionId });
          break;
        }

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await supabaseAdmin
          .from("household_plans")
          .update({
            plan: "PRO",
            status: "active",
            pro_expires_at: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);

        logStep("Invoice paid, plan renewed", { householdId, periodEnd });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const householdId = subscription.metadata?.household_id;
        
        if (!householdId) break;

        await supabaseAdmin
          .from("household_plans")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);

        logStep("Payment failed", { householdId });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const householdId = subscription.metadata?.household_id;
        
        if (!householdId) break;

        const isActive = ["active", "trialing"].includes(subscription.status);
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await supabaseAdmin
          .from("household_plans")
          .update({
            plan: isActive ? "PRO" : "BASIC",
            status: subscription.status === "past_due" ? "past_due" : 
                    subscription.status === "canceled" ? "cancelled" : "active",
            pro_expires_at: isActive ? periodEnd : null,
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);

        logStep("Subscription updated", { householdId, status: subscription.status });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const householdId = subscription.metadata?.household_id;
        
        if (!householdId) break;

        await supabaseAdmin
          .from("household_plans")
          .update({
            plan: "BASIC",
            status: "cancelled",
            stripe_subscription_id: null,
            pro_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);

        logStep("Subscription cancelled", { householdId });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    logStep("Error processing webhook", { error });
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
    });
  }
});
