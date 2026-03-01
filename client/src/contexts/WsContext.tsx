import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type WsMessage = { type: string; [key: string]: unknown };

type WsContextValue = {
  send: (msg: object) => void;
  subscribe: (cb: (msg: WsMessage) => void) => () => void;
  ready: boolean;
  authenticated: boolean;
};

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string | null;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<(msg: WsMessage) => void>>(new Set());
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((cb: (msg: WsMessage) => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setReady(true);
    ws.onclose = () => {
      setReady(false);
      setAuthenticated(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        if (msg.type === "auth_ack") setAuthenticated(true);
        listenersRef.current.forEach((cb) => cb(msg));
      } catch {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    send({ type: "auth", userId });
  }, [ready, userId, send]);

  // PC 등에서 auth_ack가 늦거나 유실되면 재전송 (최대 5회, 2초 간격)
  useEffect(() => {
    if (!ready || !userId || authenticated) return;
    let count = 0;
    const maxRetries = 5;
    const id = setInterval(() => {
      count += 1;
      send({ type: "auth", userId });
      if (count >= maxRetries) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [ready, userId, authenticated, send]);

  const value: WsContextValue = { send, subscribe, ready, authenticated };
  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}

export function useWs(): WsContextValue {
  const ctx = useContext(WsContext);
  if (!ctx) {
    return {
      send: () => {},
      subscribe: () => () => {},
      ready: false,
      authenticated: false,
    };
  }
  return ctx;
}
