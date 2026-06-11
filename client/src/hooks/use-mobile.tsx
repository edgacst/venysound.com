import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_MQ = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
/** Tailwind `lg` — 히어로 2열·스크롤 패럴랙스 등 */
const LG_BREAKPOINT = 1024
const MOBILE_UA_RE = /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini/i

/** 홈 모바일/데스크톱 분기용 — matchMedia + visualViewport + 인앱브라우저 UA 폴백 */
export function getIsMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia(MOBILE_MQ).matches) return true
  const w = window.visualViewport?.width ?? window.innerWidth
  if (w < MOBILE_BREAKPOINT) return true
  // OAuth 복귀 직후 카카오/네이버 등 인앱 브라우저가 980px 뷰포트를 주는 경우
  if (MOBILE_UA_RE.test(navigator.userAgent || "") && w < LG_BREAKPOINT) return true
  return false
}

function subscribeMobileViewport(onStoreChange: () => void) {
  const mq = window.matchMedia(MOBILE_MQ)
  mq.addEventListener("change", onStoreChange)
  window.addEventListener("resize", onStoreChange)
  window.addEventListener("orientationchange", onStoreChange)
  window.visualViewport?.addEventListener("resize", onStoreChange)
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) onStoreChange()
  }
  window.addEventListener("pageshow", onPageShow)
  return () => {
    mq.removeEventListener("change", onStoreChange)
    window.removeEventListener("resize", onStoreChange)
    window.removeEventListener("orientationchange", onStoreChange)
    window.visualViewport?.removeEventListener("resize", onStoreChange)
    window.removeEventListener("pageshow", onPageShow)
  }
}

export function useIsLgUp() {
  const [lg, setLg] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`).matches : false,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
    const onChange = () => setLg(mql.matches)
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return lg
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeMobileViewport,
    getIsMobileViewport,
    () => false,
  )
}
