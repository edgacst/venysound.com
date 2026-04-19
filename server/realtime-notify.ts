/** routes.ts 의 sendToUser 와 연결해 DB 알림 생성 시 실시간 WS 이벤트를 보냅니다. */

type SendToUserFn = (userId: string, data: unknown) => void;

let sendToUser: SendToUserFn | null = null;

export function setNotificationRealtimeSender(fn: SendToUserFn) {
  sendToUser = fn;
}

export function notifyUserNewNotification(userId: string, notificationRow: unknown) {
  if (!sendToUser) return;
  try {
    sendToUser(userId, {
      type: "new_notification",
      notification: notificationRow,
    });
  } catch {
    /* ignore */
  }
}
