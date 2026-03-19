import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  Button
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);

  const billingCheck = await billing.check({
    isTest: true,
    plans: ["Starter", "Pro"],
  });

  const activeSub = billingCheck.appSubscriptions.find(sub => sub.status === "ACTIVE");
  const activePlan = activeSub?.name || "Free";
  const planStatus = activeSub?.status || "ACTIVE";

  const localSub = await db.subscription.findUnique({ where: { shop: session.shop } });
  const updatedAt = localSub?.updatedAt ? new Date(localSub.updatedAt).getTime() : Date.now();

  // 1. Sync user data to the main Quizora server (MongoDB)
  const serverUrl = "https://quizora-server.vercel.app";
  try {
    await fetch(`${serverUrl}/api/auth/sync-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: session.shop,
        plan: activePlan,
        status: planStatus,
        updatedAt: updatedAt
      })
    });
  } catch (err) {
    console.error("Failed to sync user to server:", err);
  }

  // 2. Fetch real analytics from the backend
  let analytics = {
    totalQuizzes: 0,
    totalLeads: 0,
    conversionRate: 0,
    recentQuizzes: []
  };

  try {
    const statsRes = await fetch(`${serverUrl}/api/analytics/shopify-stats?shop=${session.shop}`);
    if (statsRes.ok) {
      analytics = await statsRes.json();
    }
  } catch (err) {
    console.error("Failed to fetch analytics:", err);
  }

  // 3. Fetch real system status
  let systemStatus = { engine: "Operational", database: "Connected" };
  try {
    const healthRes = await fetch(`${serverUrl}/api/health`);
    if (healthRes.ok) {
      const healthData = await healthRes.json();
      systemStatus.engine = healthData.engine || "Operational";
      systemStatus.database = healthData.database || "Connected";
    }
  } catch (err) {
    console.error("Failed to fetch system status:", err);
    systemStatus.engine = "Syncing...";
    systemStatus.database = "Syncing...";
  }

  return json({
    shop: session.shop,
    plan: activePlan,
    status: planStatus,
    updatedAt: updatedAt,
    analytics,
    systemStatus
  });
};

export default function Index() {
  const { shop, plan, status, updatedAt, analytics, systemStatus } = useLoaderData();
  const shopify = useAppBridge();

  const isExpired = status !== "ACTIVE";
  const shopName = shop.replace(".myshopify.com", "");
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/apps/quizora-quiz-app/app/pricing`;

  const dashboardUrl = new URL("https://quizora-admin.vercel.app/");
  dashboardUrl.searchParams.append("shop", shop);
  dashboardUrl.searchParams.append("plan", plan);
  dashboardUrl.searchParams.append("status", status);
  dashboardUrl.searchParams.append("updatedAt", updatedAt);
  dashboardUrl.searchParams.append("pricingUrl", pricingUrl);
  dashboardUrl.searchParams.append("autoLogin", "true");

  return (
    <Page title="Quizora Intelligence Dashboard">
      <ui-title-bar title="Overview" />
      {isExpired && (
        <Layout.Section>
          <Banner
            title="Subscription Expired"
            tone="critical"
            action={{ content: 'Upgrade Plan', onAction: () => window.location.href = "/app/pricing" }}
          >
            <p>Your {plan} plan is currently suspended. Please renew your subscription to reactivate your quizzes and lead tracking.</p>
          </Banner>
        </Layout.Section>
      )}

      {isExpired && (
        <ui-toast content="Plan Expired. Please upgrade to continue." duration={10000} />
      )}

      <Layout>
        {/* TOP STATS ROW */}
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <Card padding="400">
              <BlockStack gap="100" align="center">
                <Text variant="heading2xl" as="h2" tone="brand">{analytics.totalQuizzes || 0}</Text>
                <Text variant="bodySm" tone="subdued" fontWeight="bold">TOTAL QUIZZES</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100" align="center">
                <Text variant="heading2xl" as="h2" tone="success">{analytics.totalLeads || 0}</Text>
                <Text variant="bodySm" tone="subdued" fontWeight="bold">LEADS CAPTURED</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100" align="center">
                <Text variant="heading2xl" as="h2" tone="highlight">{analytics.conversionRate || 0}%</Text>
                <Text variant="bodySm" tone="subdued" fontWeight="bold">CONVERSION RATE</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100" align="center">
                <Text variant="heading2xl" as="h2" tone={status === 'ACTIVE' ? 'success' : 'attention'}>{plan}</Text>
                <Text variant="bodySm" tone="subdued" fontWeight="bold">CURRENT PLAN</Text>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>

        {/* MAIN ACTIONS & RECENT QUIZZES */}
        <Layout.Section>
          <Layout>
            <Layout.Section>
              <Card padding="500">
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Platform Hub</Text>
                    <Text variant="bodyMd" tone="subdued">
                      Access the full engineering suite to build, design, and deploy high-conversion quizzes.
                    </Text>
                  </BlockStack>
                  <div style={{ marginTop: '12px' }}>
                    <Button
                      variant="primary"
                      size="large"
                      fullWidth
                      onClick={() => window.open(dashboardUrl.toString(), '_blank')}
                    >
                      Launch Quizora Admin Console
                    </Button>
                  </div>
                </BlockStack>
              </Card>

              <div style={{ marginTop: '24px' }}>
                <Card padding="500">
                  <BlockStack gap="400">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text as="h2" variant="headingMd">Active Campaigns</Text>
                      <Button variant="plain" onClick={() => window.open(dashboardUrl.toString(), '_blank')}>View all →</Button>
                    </div>

                    {analytics.recentQuizzes?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {analytics.recentQuizzes.map((quiz) => (
                          <div key={quiz._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e1e3e5' }}>
                            <BlockStack gap="0">
                              <Text fontWeight="bold" variant="bodyMd">{quiz.title}</Text>
                              <Text variant="bodyXs" tone="subdued">Last updated: {new Date(quiz.updatedAt).toLocaleDateString()}</Text>
                            </BlockStack>
                            <Badge tone={quiz.status === 'published' ? 'success' : 'attention'}>{quiz.status}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Box padding="60" textAlign="center" background="bg-surface-secondary" borderRadius="10">
                        <BlockStack gap="400" align="center">
                          <div style={{ fontSize: '40px' }}>📊</div>
                          <BlockStack gap="100">
                            <Text variant="headingMd" as="h3">No active quizzes found</Text>
                            <Text tone="subdued">Start by creating your first campaign to see analytics here.</Text>
                          </BlockStack>
                          <Button variant="secondary" onClick={() => window.open(dashboardUrl.toString(), '_blank')}>Create First Quiz</Button>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              </div>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Dashboard Menu</Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBlockStart: '12px' }}>
                      <Button variant="plain" textAlign="left" onClick={() => shopify.toast.show('Navigating to billing...')} url="/app/pricing">Plan Management</Button>
                    </div>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Platform Status</Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBlockStart: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: systemStatus.engine === 'Operational' ? '#10b981' : '#f59e0b', boxShadow: `0 0 8px ${systemStatus.engine === 'Operational' ? '#10b981' : '#f59e0b'}` }}></div>
                        <Text variant="bodySm" fontWeight="bold">Engine: {systemStatus.engine}</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: systemStatus.database === 'Connected' ? '#10b981' : '#f59e0b', boxShadow: `0 0 8px ${systemStatus.database === 'Connected' ? '#10b981' : '#f59e0b'}` }}></div>
                        <Text variant="bodySm" fontWeight="bold">Database: {systemStatus.database}</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// Helper components for layout
const Box = ({ children, padding, textAlign, background, borderRadius }) => (
  <div style={{
    padding: padding ? `${padding}px` : '24px',
    textAlign: textAlign || 'center',
    background: background === 'bg-surface-secondary' ? '#f1f2f4' : 'transparent',
    borderRadius: borderRadius ? `${borderRadius}px` : '12px',
    border: background === 'bg-surface-secondary' ? '1px solid #e1e3e5' : 'none',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    {children}
  </div>
);

const Badge = ({ children, tone }) => {
  const colors = {
    success: { bg: '#e7fcf1', text: '#008060', border: '#bbe5b3' },
    attention: { bg: '#fff4e5', text: '#945b00', border: '#ffda8a' },
  };
  const style = colors[tone] || colors.attention;
  return (
    <span style={{
      backgroundColor: style.bg,
      color: style.text,
      border: `1px solid ${style.border}`,
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.02em'
    }}>
      {children}
    </span>
  );
};
