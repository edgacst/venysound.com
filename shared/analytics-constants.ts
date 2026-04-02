/**
 * 체류 시간 추정용 내부 하트비트 전용 path.
 * 실제 페이지뷰·지역·디바이스·유입 집계에서는 제외하고, 세션 내 min/max visited_at 간격에는 포함.
 */
export const ANALYTICS_DWELL_HEARTBEAT_PATH = "/__vs_hb";
