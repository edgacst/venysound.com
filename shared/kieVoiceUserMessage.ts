/** KIE 저작권·유사음원 거절 시 사용자에게 보여 줄 고정 문구 */
export const KIE_VOICE_COPYRIGHT_REJECTION_USER_MESSAGE =
  "기존음원을 녹음하지말고 가상의 노래를 녹음한 음원을 업로드 하세요";

/** KIE(api.kie.ai) 계정 크레딧 부족 — 베니사운드 지갑·회원 크레딧과 무관 */
export const KIE_CREDITS_INSUFFICIENT_USER_MESSAGE =
  "AI 생성 서비스(KIE) 계정 크레딧이 부족합니다. kie.ai에서 API 키 계정에 크레딧을 충전한 뒤 다시 시도해 주세요. (앱 지갑 잔액과는 별개입니다.)";

/** sunoapi.org 보이스·녹음 생성 — 앱 지갑과 무관 */
export const SUNOAPI_CREDITS_INSUFFICIENT_USER_MESSAGE =
  "AI 생성 서비스(sunoapi.org) 계정 크레딧이 부족합니다. sunoapi.org 대시보드에서 API 키 계정에 크레딧을 충전한 뒤 다시 시도해 주세요. (앱 지갑 잔액과는 별개입니다.)";

export function isKieCreditsInsufficient(raw?: string | null): boolean {
  const lower = (raw ?? "").toLowerCase();
  return (
    lower.includes("credits insufficient") ||
    lower.includes("credit insufficient") ||
    lower.includes("balance isn't enough") ||
    lower.includes("balance is not enough") ||
    lower.includes("please top up") ||
    lower.includes("top up to continue") ||
    (lower.includes("insufficient") && lower.includes("credit")) ||
    lower.includes("积分不足") ||
    lower.includes("余额不足")
  );
}

export function isKieVoiceCopyrightRejection(raw?: string | null): boolean {
  const lower = (raw ?? "").toLowerCase();
  return (
    lower.includes("existing work of art") ||
    lower.includes("matches existing") ||
    (lower.includes("copyright") && !lower.includes("credit")) ||
    lower.includes("infringement")
  );
}

/** KIE·Suno API 영문 오류 → 사용자 안내 (한국어) */
export function formatKieApiUserMessage(
  raw?: string | null,
  opts?: { creditsProvider?: "kie" | "suno" },
): string {
  const s = (raw ?? "").trim();
  if (!s) return "";

  if (isKieCreditsInsufficient(s)) {
    return opts?.creditsProvider === "suno"
      ? SUNOAPI_CREDITS_INSUFFICIENT_USER_MESSAGE
      : KIE_CREDITS_INSUFFICIENT_USER_MESSAGE;
  }
  if (isKieVoiceCopyrightRejection(s)) {
    return KIE_VOICE_COPYRIGHT_REJECTION_USER_MESSAGE;
  }

  return s;
}

/** Suno 보이스 API 전용 (빈 메시지 기본값) */
export function formatKieVoiceUserMessage(
  raw?: string | null,
  opts?: { creditsProvider?: "kie" | "suno" },
): string {
  const mapped = formatKieApiUserMessage(raw, opts);
  if (mapped) return mapped;
  return "보이스 검증에 실패했습니다. 다시 시도해 주세요.";
}
