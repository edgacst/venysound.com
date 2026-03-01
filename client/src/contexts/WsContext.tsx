import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type WsMessage = { type: string; [key: string]: unknown };

type WsContextValue = {
  send: (msg: object) => void;
  subscribe: (cb: (msg: WsMessage) => void) => () => void;
  ready: boolean;
  authenticated: boolean;
};

const WsContext = createContext<WsContextValue | null>(null);

const RECONNECT_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 15000;

export function WsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string | null;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<(msg: WsMessage) => void>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function connect() {
      if (!mountedRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptRef.current = 0;
        setReady(true);
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;
        setReady(false);
        setAuthenticated(false);
        if (reconnectTimeoutRef.current) return;
        const delay = Math.min(
          RECONNECT_DELAY_MS * Math.pow(1.5, Math.min(reconnectAttemptRef.current, 10)),
          RECONNECT_MAX_DELAY_MS
        );
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          if (msg.type === "auth_ack" && mountedRef.current) setAuthenticated(true);
          listenersRef.current.forEach((cb) => cb(msg));
        } catch {}
      };
    }

    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }
      setReady(false);
      setAuthenticated(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    send({ type: "auth", userId });
  }, [ready, userId, send]);

  // auth_ack가 늦거나 유실되면 재전송 (최대 5회, 2초 간격)
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
