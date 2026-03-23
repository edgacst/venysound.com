import { storage } from "../storage";
import type { DistributionRelease } from "../../shared/schema";

export type DistributorSubmitResult = {
  externalReleaseRef: string;
  status: "delivered" | "live";
};

/**
 * Distributor submit adapter (스캐폴딩).
 *
 * 현재 시스템은 실제 DistroKid/TuneCore “제출 API” 상세 스펙(요청/응답 필드)을
 * 아직 코드에 하드코딩하지 않습니다.
 *
 * 대신:
 * - 기본 동작: 기존 로직(approved -> delivered + externalReleaseRef 고정) 유지
 * - 이후: DistroKid/TuneCore 실제 API 호출이 필요하면 이 함수 내부만 교체하면 됩니다.
 */
export async function submitDistributionReleaseToDistributor(input: {
  adminUserId: string;
  release: DistributionRelease;
  distributor: string;
}): Promise<DistributorSubmitResult> {
  // 현재 구현: externalReleaseRef를 고정 규칙으로 생성하고 delivered로 전환
  // (status/webhook는 이미 별도 엔드포인트로 처리 중)
  const updated = await storage.publishDistributionRelease({
    adminUserId: input.adminUserId,
    releaseId: input.release.id,
    distributor: input.distributor,
  });

  if (!updated) {
    throw new Error(`publishDistributionRelease failed (releaseId=${input.release.id})`);
  }

  return {
    externalReleaseRef: updated.externalReleaseRef ?? `${input.distributor}:${input.release.id}`,
    status: updated.status === "live" ? "live" : "delivered",
  };
}

