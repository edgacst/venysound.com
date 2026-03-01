import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWs } from "@/contexts/WsContext";

export function useRadioRoom(slug: string | undefined, displayName?: string | null) {
  const { send, subscribe, ready } = useWs();
  const [listenerCount, setListenerCount] = useState<number>(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!slug || !ready) return;
    const normalizedSlug = slug.trim().toLowerCase();
    const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : undefined;

    send({ type: "radio_join", slug: normalizedSlug, displayName: name });

    const unsub = subscribe((msg) => {
      if (msg.type === "radio_listeners" && msg.slug === normalizedSlug && typeof msg.count === "number") {
        setListenerCount(msg.count);
      }
      if (msg.type === "radio_now_playing" || msg.type === "radio_broadcast_ended") {
        queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
      }
    });

    return () => {
      send({ type: "radio_leave", slug: normalizedSlug });
      unsub();
    };
  }, [slug, ready, send, subscribe, queryClient, displayName]);

  return { listenerCount };
}
