/** 가입 퍼널 등 전환 이벤트 — 서버 allowlist와 동기화 */
export const ANALYTICS_SIGNUP_CONVERSION_EVENTS = [
  "signup_page_view",
  "signup_oauth_click",
  "signup_step2",
  "signup_submit",
  "signup_success",
  "signup_fail",
] as const;

export type AnalyticsSignupConversionEvent = (typeof ANALYTICS_SIGNUP_CONVERSION_EVENTS)[number];

export function isAllowedSignupConversionEvent(s: string): s is AnalyticsSignupConversionEvent {
  return (ANALYTICS_SIGNUP_CONVERSION_EVENTS as readonly string[]).includes(s);
}
