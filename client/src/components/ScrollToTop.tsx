import { useState, useEffect, useCallback } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/components/AudioPlayer";

const SCROLL_THRESHOLD = 400;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const activeMusicId = usePlayerStore((s) => s.activeMusicId);

  const onScroll = useCallback(() => {
    setVisible(window.scrollY > SCROLL_THRESHOLD);
  }, []);

  useEffect(() => {
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!visible) return null;

  const bottomClass = activeMusicId != null ? "bottom-[5.5rem]" : "bottom-6";

  return (
    <Button
      size="icon"
      variant="secondary"
      className={`fixed right-4 z-40 rounded-full shadow-lg size-11 border border-border bg-card/95 backdrop-blur hover:bg-card ${bottomClass}`}
      style={{ marginRight: "env(safe-area-inset-right)", marginBottom: "env(safe-area-inset-bottom)" }}
      onClick={scrollToTop}
      aria-label="맨 위로"
      data-testid="button-scroll-to-top"
    >
      <ArrowUp size={20} />
    </Button>
  );
}
