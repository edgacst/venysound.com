/**
 * 웹 푸시 구독 훅
 * - 로그인한 사용자가 처음 방문할 때 알림 허용 요청
 * - 구독 정보를 서버에 저장
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const { user } = useAuth();
  const tried = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (tried.current) return;
    tried.current = true;

    // 브라우저 지원 확인
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // 이미 허용/거부된 경우 재요청 안 함
    if (Notification.permission === "denied") return;

    async function subscribe() {
      try {
        // VAPID 공개키 조회
        const keyRes = await fetch("/api/push-vapid-public");
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json() as { publicKey: string };
        if (!publicKey) return;

        const reg = await navigator.serviceWorker.ready;

        // 이미 구독 중이면 서버에 재등록만
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          // 알림 허용 요청 (브라우저 팝업)
          const permission = await Notification.requestPermission();
          if (permission !== "granted") return;
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        const json = sub.toJSON();
        await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          }),
        });
      } catch (e) {
        // 조용히 실패 (사용자 경험에 영향 없음)
        console.warn("[push] subscribe error:", e);
      }
    }

    // 첫 방문 시 즉시 요청하면 거부율이 높아서 3초 후 요청
    const timer = setTimeout(() => { void subscribe(); }, 3000);
    return () => clearTimeout(timer);
  }, [user]);
}
