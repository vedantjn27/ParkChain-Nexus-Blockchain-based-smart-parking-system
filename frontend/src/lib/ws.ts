import { WS_URL } from "@/config";
import type { WsMessage } from "@/lib/types";

export type WsHandler = (msg: WsMessage) => void;

export function connectChainFeed(onMessage: WsHandler): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: number | undefined;

  function open() {
    if (closed) return;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      schedule();
      return;
    }
    socket.onopen = () => {
      retry = 0;
    };
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        onMessage(msg);
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => schedule();
    socket.onerror = () => socket?.close();
  }
  function schedule() {
    if (closed) return;
    retry = Math.min(retry + 1, 6);
    const delay = Math.min(1000 * 2 ** retry, 15000);
    timer = window.setTimeout(open, delay);
  }
  open();
  return () => {
    closed = true;
    if (timer) window.clearTimeout(timer);
    socket?.close();
  };
}
