/**
 * FCM V1 API를 사용한 푸시 알림 전송
 * Firebase 서비스 계정으로 OAuth2 토큰 발급 후 FCM V1 API 호출
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  try {
    // JWT 생성
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: Math.floor(now / 1000) + 3600,
      iat: Math.floor(now / 1000),
    })).toString("base64url");

    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(privateKey, "base64url");
    const jwt = `${header}.${payload}.${signature}`;

    // 액세스 토큰 발급
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!resp.ok) {
      console.error("[push] 토큰 발급 실패:", await resp.text());
      return null;
    }

    const data = await resp.json() as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return cachedToken.token;
  } catch (err) {
    console.error("[push] JWT 생성 에러:", err);
    return null;
  }
}

export function isPushConfigured(): boolean {
  return !!(process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY && process.env.FCM_PROJECT_ID);
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string }
): Promise<void> {
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) return;

  const token = await getFcmAccessToken();
  if (!token) return;

  // endpoint에서 FCM registration token 추출
  // https://fcm.googleapis.com/fcm/send/TOKEN 또는
  // https://updates.push.services.mozilla.com/... 등
  const endpoint = subscription.endpoint;
  let registrationToken: string | null = null;

  if (endpoint.includes("fcm.googleapis.com")) {
    const parts = endpoint.split("/");
    registrationToken = parts[parts.length - 1];
  }

  if (!registrationToken) {
    // FCM 엔드포인트가 아닌 경우 (Firefox 등) - VAPID 방식 필요, 현재 지원 안 함
    console.warn("[push] FCM 엔드포인트가 아님, 건너뜀:", endpoint.slice(0, 50));
    return;
  }

  try {
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: {
            token: registrationToken,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            webpush: {
              notification: {
                title: payload.title,
                body: payload.body,
                icon: "/favicon.png",
                requireInteraction: true,
              },
              fcm_options: {
                link: payload.url,
              },
            },
          },
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[push] FCM V1 전송 실패:", resp.status, errText);
    } else {
      console.log("[push] FCM V1 전송 성공");
    }
  } catch (err: any) {
    console.error("[push] send error:", err?.message || err);
  }
}
