/**
 * Web Push for "new music for you" notifications.
 * Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable.
 */

let webPush: typeof import("web-push") | null = null;

async function getWebPush(): Promise<typeof import("web-push") | null> {
  if (webPush) return webPush;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  try {
    webPush = (await import("web-push")).default;
    webPush.setVAPIDDetails("mailto:noreply@venysound.com", pub, priv);
    return webPush;
  } catch {
    return null;
  }
}

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string }
): Promise<void> {
  const wp = await getWebPush();
  if (!wp) return;
  try {
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify(payload),
      { TTL: 86400 }
    );
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      // Subscription expired or invalid — caller could remove it
    }
    console.error("[push] send error:", err?.message || err);
  }
}
