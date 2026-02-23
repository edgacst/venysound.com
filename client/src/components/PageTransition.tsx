import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** 애니메이션 없이 감싸기만 함 (탭 전환 시 페이지 움직임 방지) */
export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return <div className={className}>{children}</div>;
}
