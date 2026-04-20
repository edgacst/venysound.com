/**
 * 사이트 사용 안내용 로컬 챗봇 지식.
 * 운영 시 이 배열만 편집하면 됩니다(외부 LLM API 없음).
 */
export type HelpSiteEntry = {
  id: string;
  title: string;
  summary: string;
  /** 사이트 내부 경로(선택) */
  href?: string;
  /** 질문에 자주 나오는 단어·동의어(한글·영문 혼용 가능) */
  keywords?: string[];
};

export const HELP_SITE_ENTRIES: HelpSiteEntry[] = [
  {
    id: "faq",
    title: "자주 묻는 질문(FAQ)",
    summary: "결제·크레딧·이용 제한 등 전반적인 질문과 답변을 모아 둔 페이지입니다.",
    href: "/faq",
    keywords: ["faq", "질문", "문의", "결제", "환불", "고객", "도움"],
  },
  {
    id: "guide",
    title: "이용 가이드",
    summary: "서비스를 처음 쓸 때 필요한 기본 사용 흐름을 안내합니다.",
    href: "/guide",
    keywords: ["가이드", "시작", "처음", "이용법", "사용법", "튜토리얼", "help"],
  },
  {
    id: "file-guide",
    title: "파일 업로드 가이드",
    summary: "음원 파일 형식·용량·업로드 시 주의사항을 정리했습니다.",
    href: "/file-guide",
    keywords: ["파일", "형식", "mp3", "wav", "용량", "업로드", "올리기", "등록"],
  },
  {
    id: "upload",
    title: "음악 업로드",
    summary: "새 음악을 사이트에 올리는 화면입니다.",
    href: "/upload",
    keywords: ["업로드", "등록", "올리기", "게시", "발매", "음악", "곡"],
  },
  {
    id: "bulk-upload",
    title: "대량 업로드",
    summary: "여러 곡을 한 번에 올릴 때 사용하는 화면입니다.",
    href: "/bulk-upload",
    keywords: ["대량", "여러", "한번에", "일괄", "벌크", "bulk"],
  },
  {
    id: "radio",
    title: "라디오",
    summary: "라디오 스트리밍·편성 관련 기능을 이용하는 화면입니다.",
    href: "/radio",
    keywords: ["라디오", "방송", "스트리밍", "dj", "편성"],
  },
  {
    id: "credits",
    title: "크레딧",
    summary: "크레딧 충전·사용 내역을 확인하는 화면입니다.",
    href: "/credits",
    keywords: ["크레딧", "충전", "결제", "코인", "wallet", "잔액"],
  },
  {
    id: "pricing",
    title: "요금제",
    summary: "구독·요금 관련 안내 페이지입니다.",
    href: "/pricing",
    keywords: ["요금", "구독", "플랜", "가격", "결제", "유료"],
  },
  {
    id: "create-music",
    title: "AI 음악 만들기",
    summary: "AI로 곡을 생성·편집하는 기능 진입점입니다.",
    href: "/create-music",
    keywords: ["ai", "인공지능", "생성", "만들기", "써노", "suno", "작곡"],
  },
  {
    id: "suno-guide",
    title: "Suno 가이드",
    summary: "AI 음악(Suno) 사용 시 참고할 수 있는 안내입니다.",
    href: "/suno-guide",
    keywords: ["suno", "써노", "ai", "가이드", "프롬프트"],
  },
  {
    id: "global-distribution-guide",
    title: "글로벌 유통 가이드",
    summary: "해외 유통·배포 절차를 단계별로 설명합니다.",
    href: "/global-distribution-guide",
    keywords: ["유통", "배포", "글로벌", "해외", "딜리버리", "dsp"],
  },
];
