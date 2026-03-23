/** 1크레딧당 공급가액(원, 부가세 전) */
export const CREDIT_TO_WON = 7.5;

export function creditsSupplyWon(credits: number): number {
  return Math.round(credits * CREDIT_TO_WON);
}

/** 총 결제액(부가세 10% 포함) */
export function creditsTotalWithVatWon(credits: number): number {
  return Math.round(creditsSupplyWon(credits) * 1.1);
}

/** 카드/입금 총액(부가세 포함) → 적립 크레딧 수 */
export function creditsFromTotalVatInclusiveWon(totalWon: number): number {
  return Math.round(totalWon / (CREDIT_TO_WON * 1.1));
}

/** 패키지 정의(선택 공급가). 없으면 1크레딧 7.5원 기준 */
export type CreditPackagePricing = { amount: number; supplyWon?: number };

export function creditPackageSupplyWon(pkg: CreditPackagePricing): number {
  return pkg.supplyWon ?? creditsSupplyWon(pkg.amount);
}

export function creditPackageTotalVatWon(pkg: CreditPackagePricing): number {
  return Math.round(creditPackageSupplyWon(pkg) * 1.1);
}
