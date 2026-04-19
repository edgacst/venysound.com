import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { useWs } from "@/contexts/WsContext";
import { playInAppSound } from "@/lib/in-app-sounds";

/**
 * 전역 WS: 새 DM·인앱 알림 수신 시 쿼리 갱신 + 알림음.
 * Messages 페이지 전용 소켓과 중복되지 않도록 해당 페이지에서는 별도 WS를 두지 않는다.
 */
export function useRealtimeInbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { subscribe } = useWs();

  useEffect(() => {
    if (!user?.id) return;
    return subscribe((msg) => {
      if (msg.type === "new_message" && msg.conversationId != null) {
        playInAppSound("message");
        const cid = msg.conversationId as number;
        const payload = msg.message as Record<string, unknown> | undefined;
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
        if (payload && typeof cid === "number") {
          const newMsg = {
            id: payload.id,
            conversation_id: cid,
            sender_id: payload.sender_id ?? payload.senderId,
            content: payload.content ?? "",
            created_at: payload.created_at ?? payload.createdAt,
            sender_first_name: payload.sender_first_name ?? "",
            sender_last_name: payload.sender_last_name ?? "",
            sender_image: payload.sender_image ?? null,
          };
          queryClient.setQueryData(["/api/conversations", cid, "messages"], (old: unknown) => {
            const list = (old as any[]) ?? [];
            if (list.some((m: any) => String(m.id) === String(newMsg.id))) return list;
            return [...list, newMsg];
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", cid, "messages"] });
        queryClient.refetchQueries({ queryKey: ["/api/conversations", cid, "messages"] });
        return;
      }
      if (msg.type === "new_notification") {
        playInAppSound("notification");
        queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
        queryClient.refetchQueries({ queryKey: [api.notifications.list.path] });
      }
    });
  }, [user?.id, subscribe, queryClient]);
}

export function RealtimeInboxSync() {
  useRealtimeInbox();
  return null;
}
