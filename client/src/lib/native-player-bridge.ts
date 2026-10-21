export type NativePlayerMessage = {
  v: 1;
  type: string;
  ts: number;
  payload: Record<string, unknown>;
};

type MessageListener = (message: NativePlayerMessage) => void;
type ReadyListener = () => void;

const TRUSTED_ORIGINS = new Set([
  "https://venysound.com",
  "android-app://venysound.com",
]);

let installed = false;
let ready = false;
let port: MessagePort | null = null;
const messageListeners = new Set<MessageListener>();
const readyListeners = new Set<ReadyListener>();

function parseMessage(data: unknown): NativePlayerMessage | null {
  try {
    const value = typeof data === "string" ? JSON.parse(data) : data;
    if (!value || typeof value !== "object") return null;
    const message = value as Partial<NativePlayerMessage>;
    if (message.v !== 1 || typeof message.type !== "string") return null;
    return {
      v: 1,
      type: message.type,
      ts: typeof message.ts === "number" ? message.ts : Date.now(),
      payload:
        message.payload && typeof message.payload === "object"
          ? (message.payload as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

function setReady(next: boolean) {
  if (ready === next) return;
  ready = next;
  readyListeners.forEach((listener) => listener());
}

function dispatch(data: unknown) {
  const message = parseMessage(data);
  if (!message) return;
  if (message.type === "bridge.ready") setReady(true);
  messageListeners.forEach((listener) => listener(message));
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin && !TRUSTED_ORIGINS.has(event.origin)) return;
    const incomingPort = event.ports?.[0] ?? null;
    if (incomingPort && incomingPort !== port) {
      port = incomingPort;
      port.onmessage = (portEvent) => dispatch(portEvent.data);
      port.start?.();
      postNativePlayerMessage("bridge.hello", {
        webVersion: 1,
        capabilities: ["music", "radio"],
      });
    }
    dispatch(event.data);
  });
}

export function isNativePlayerReady() {
  install();
  return ready;
}

export function subscribeNativePlayerReady(listener: ReadyListener) {
  install();
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

export function subscribeNativePlayer(listener: MessageListener) {
  install();
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
}

export function postNativePlayerMessage(
  type: string,
  payload: Record<string, unknown> = {},
) {
  install();
  if (!port) return false;
  const message: NativePlayerMessage = {
    v: 1,
    type,
    ts: Date.now(),
    payload,
  };
  try {
    port.postMessage(JSON.stringify(message));
    return true;
  } catch {
    port = null;
    setReady(false);
    return false;
  }
}
