/**
 * 후원 뱃지 로직 테스트
 * 실행: npx tsx script/test-donation-badge.ts
 */

function calculateDonationBadge(totalSent: number): string | null {
  if (totalSent >= 200000) return "sponsor";
  if (totalSent >= 50000) return "supporter";
  if (totalSent >= 10000) return "sprout";
  if (totalSent >= 100) return "seed";
  return null;
}

const cases: { total: number; expected: string | null }[] = [
  { total: 0, expected: null },
  { total: 99, expected: null },
  { total: 100, expected: "seed" },
  { total: 5000, expected: "seed" },
  { total: 9999, expected: "seed" },
  { total: 10000, expected: "sprout" },
  { total: 49999, expected: "sprout" },
  { total: 50000, expected: "supporter" },
  { total: 199999, expected: "supporter" },
  { total: 200000, expected: "sponsor" },
  { total: 1000000, expected: "sponsor" },
];

let passed = 0;
let failed = 0;

console.log("=== 후원 뱃지 계산 테스트 ===\n");

for (const { total, expected } of cases) {
  const got = calculateDonationBadge(total);
  const ok = got === expected;
  if (ok) {
    passed++;
    console.log(`  ✅ ${total.toLocaleString()}원 → ${got ?? "null"}`);
  } else {
    failed++;
    console.log(`  ❌ ${total.toLocaleString()}원 → 기대: ${expected}, 실제: ${got}`);
  }
}

console.log(`\n결과: ${passed} 통과, ${failed} 실패`);
process.exit(failed > 0 ? 1 : 0);
