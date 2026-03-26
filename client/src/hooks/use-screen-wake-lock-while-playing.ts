import { useEffect } from "react";

/**
 * 재생 중 화면 자동 꺼짐(절전)만 막습니다. 전원 버튼으로 잠그면 OS가 오디오를 멈출 수 있습니다(특히 iOS Safari).
 * 여러 플레이어가 동시에 켜져도 Wake Lock 은 문서당 하나만 유지합니다.
 */
let interestCount = 0;
let sentinel: WakeLockSentinel | null = null;
let wakeLockAcquirePending = false;
let onVisibilityChange: (() => void) | null = null;

function releaseSentinel() {
  const s = sentinel;
  sentinel = null;
  if (s) void s.release().catch(() => {});
}

function acquireSentinel() {
  if (typeof navigator === "undefined") return;
  const wl = navigator.wakeLock;
  if (!wl || typeof wl.request !== "function") return;
  if (sentinel || wakeLockAcquirePending || document.visibilityState !== "visible") return;
  wakeLockAcquirePending = true;
  void wl
    .request("screen")
    .then((s) => {
      wakeLockAcquirePending = false;
      if (interestCount <= 0) {
        void s.release().catch(() => {});
        return;
      }
      if (sentinel && sentinel !== s) void sentinel.release().catch(() => {});
      sentinel = s;
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
      });
    })
    .catch(() => {
      wakeLockAcquirePending = false;
    });
}

function attachVisibilityListener() {
  if (onVisibilityChange) return;
  onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      releaseSentinel();
      return;
    }
    if (interestCount > 0) acquireSentinel();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function detachVisibilityListener() {
  if (!onVisibilityChange) return;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  onVisibilityChange = null;
}

function addInterest(): () => void {
  interestCount++;
  if (interestCount === 1) {
    attachVisibilityListener();
    acquireSentinel();
  }
  return () => {
    interestCount = Math.max(0, interestCount - 1);
    if (interestCount === 0) {
      detachVisibilityListener();
      releaseSentinel();
    }
  };
}

export function useScreenWakeLockWhilePlaying(shouldHold: boolean) {
  useEffect(() => {
    if (!shouldHold) return;
    return addInterest();
  }, [shouldHold]);
}
