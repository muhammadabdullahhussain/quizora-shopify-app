import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} notification for ${shop}`);

  // Topic: APP_SUBSCRIPTIONS_UPDATE
  // Payload contains app_subscription object
  const subscription = payload.app_subscription;
  
  if (subscription) {
    const planName = subscription.name;
    const status = subscription.status; // e.g., 'ACTIVE', 'CANCELLED', 'EXPIRED'

    try {
      await db.subscription.upsert({
        where: { shop },
        update: { 
            plan: planName, 
            status: status,
            updatedAt: new Date(),
        },
        create: { 
            shop, 
            plan: planName, 
            status: status 
        },
      });
      console.log(`Successfully updated subscription for ${shop} to ${planName} (${status})`);
    } catch (error) {
      console.error(`Failed to update subscription for ${shop}:`, error);
    }
  }

  return new Response();
};
