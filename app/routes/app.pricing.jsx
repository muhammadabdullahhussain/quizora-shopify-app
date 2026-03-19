import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  List,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  try {
    // Check which plans are active
    const billingCheck = await billing.check({
      isTest: true,
      plans: ["Starter", "Pro"],
    });

    const activeSub = billingCheck.appSubscriptions.find(sub => sub.status === "ACTIVE");
    const activePlan = activeSub?.name || "Free";
    const planStatus = activeSub?.status || "ACTIVE";
    const serverUrl = "https://quizora-server.vercel.app";

    try {
      await fetch(`${serverUrl}/api/auth/sync-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: session.shop,
          plan: activePlan,
          status: planStatus,
          updatedAt: Date.now()
        })
      });
    } catch (err) {
      console.error("Failed to sync user to server on pricing page:", err);
    }

    return json({
      plans: [
        {
          name: "Free",
          price: "$0",
          description: "Perfect for testing and small stores",
          features: ["100 Quiz Completions/mo", "Basic Analytics", "Standard Support"],
          isCurrent: !billingCheck.hasActivePayment,
          action: "Free"
        },
        {
          name: "Starter Plan",
          price: "$19",
          description: "Ideal for growing businesses",
          features: ["1,000 Quiz Completions/mo", "Remove Quizora Branding", "Priority Support"],
          isCurrent: billingCheck.appSubscriptions.some(sub => sub.name === "Starter"),
          action: "Starter"
        },
        {
          name: "Pro Plan",
          price: "$49",
          description: "Unlimited power for high-volume stores",
          features: ["Unlimited Quiz Completions", "Advanced AI Recommendations", "24/7 Premium Support"],
          isCurrent: billingCheck.appSubscriptions.some(sub => sub.name === "Pro"),
          action: "Pro"
        }
      ]
    });
  } catch (error) {
    console.error("Billing check failed:", error);
    return json({ plans: [] });
  }
};

export const action = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planName = formData.get("plan");

  if (planName === "Free") {
    // A downgrade to the Free plan requires cancelling any active subscriptions
    try {
      const billingCheck = await billing.check({
        isTest: true,
        plans: ["Starter", "Pro"],
      });

      const activeSub = billingCheck.appSubscriptions.find(sub => sub.status === "ACTIVE");
      if (activeSub) {
        await billing.cancel({
          subscriptionId: activeSub.id,
          isTest: true,
          prorate: true,
        });
      }
      return json({ status: "success" });
    } catch (err) {
      console.error("DEBUG: Failed to cancel plan:", err);
      return json({ status: "error", message: err.message });
    }
  }

  try {
    // Dynamically construct the absolute Shopify Admin URL to guarantee we return inside the iframe
    // By using the exact API_KEY, we bypass any dynamic CLI extensions (e.g., app-name-1 vs app-name)
    const shopDomain = session.shop;
    const shopName = shopDomain.replace('.myshopify.com', '');
    const apiKey = process.env.SHOPIFY_API_KEY;
    const returnUrl = `https://admin.shopify.com/store/${shopName}/apps/${apiKey}/app/pricing`;
    
    console.log("DEBUG: Requesting billing for plan:", planName, "with returnUrl:", returnUrl);
    
    return await billing.request({
      plan: planName,
      isTest: true,
      returnUrl: returnUrl,
    });
  } catch (error) {
    console.error("DEBUG: Billing Request Error Full:", error);
    throw error;
  }
};

export default function PricingPage() {
  const { plans } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <Page>
      <TitleBar title="Pricing & Plans" />
      <Layout>
        <Layout.Section>
          <Box paddingBlockEnd="800">
            <BlockStack gap="500" align="center">
              <Text as="h1" variant="heading2xl" textAlign="center">
                Upgrade your Quizora experience
              </Text>
              <Text as="p" variant="bodyLg" textAlign="center" tone="subdued">
                Select a plan that fits your business needs. Upgrade or downgrade anytime.
              </Text>
            </BlockStack>
          </Box>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '24px',
            alignItems: 'start'
          }}>
            {plans.map((plan) => (
              <Card key={plan.name}>
                <BlockStack gap="600">
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingLg">{plan.name}</Text>
                      {plan.isCurrent && <Badge tone="success">Active</Badge>}
                    </InlineStack>
                    <InlineStack align="start" blockAlign="center" gap="100">
                        <Text variant="heading2xl">{plan.price}</Text>
                        <Text as="span" variant="bodyMd" tone="subdued">/mo</Text>
                    </InlineStack>
                    <Text as="p" variant="bodyMd" tone="subdued">{plan.description}</Text>
                  </BlockStack>

                  <Box borderBlockStartWidth="025" borderColor="border" paddingBlockStart="400">
                    <BlockStack gap="300">
                        <Text variant="headingMd">What's included:</Text>
                        <List>
                            {plan.features.map(feature => (
                                <List.Item key={feature}>{feature}</List.Item>
                            ))}
                        </List>
                    </BlockStack>
                  </Box>

                  <fetcher.Form method="post">
                    <input type="hidden" name="plan" value={plan.action} />
                    <Button 
                      fullWidth 
                      variant={plan.name === "Pro Plan" ? "primary" : "secondary"}
                      disabled={plan.isCurrent}
                      loading={fetcher.state !== "idle" && fetcher.formData?.get("plan") === plan.action}
                      submit
                    >
                      {plan.isCurrent ? "Active Plan" : plan.name === "Free" ? "Downgrade" : "Subscribe Now"}
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              </Card>
            ))}
          </div>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Billing FAQs</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>Can I change my plan later?</strong><br/>
                  Yes, you can upgrade or downgrade your plan at any time directly from this page.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>How does the free trial work?</strong><br/>
                  All paid plans come with a 7-day free trial so you can test the premium features risk-free.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
