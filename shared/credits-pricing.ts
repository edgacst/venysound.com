/** 레거시: 1크레딧당 공급가(원). 마이그레이션·과거 데이터 설명용 */
export const LEGACY_CREDIT_TO_SUPPLY_WON = 7.5;

/** 총 결제액(부가세 10% 포함, 원) → 지갑에 적립할 원(공급가액, 정수) */
export function walletSupplyWonFromTotalPaymentVatInclusive(totalWon: number): number {
  return Math.round(totalWon / 1.1);
}

/** 카드/토스 충전: 기본 총결제액(부가세 포함) */
export const WALLET_TOPUP_DEFAULT_TOTAL_WON = 3000;
/** + 버튼 시 총결제액 증가 폭 */
export const WALLET_TOPUP_STEP_TOTAL_WON = 2000;
export const WALLET_TOPUP_MIN_TOTAL_WON = WALLET_TOPUP_DEFAULT_TOTAL_WON;

/** @deprecated 마이그레이션 전 전용 — 신규 코드는 walletSupplyWonFromTotalPaymentVatInclusive 사용 */
export function creditsFromTotalVatInclusiveWon(totalWon: number): number {
  return Math.round(totalWon / (LEGACY_CREDIT_TO_SUPPLY_WON * 1.1));
}
