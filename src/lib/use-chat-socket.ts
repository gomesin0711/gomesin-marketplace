"use client";

/**
 * useChatSocket — singleton socket.io manager for realtime chat.
 *
 * Connects to the chat-service mini-service on port 3003 via the gateway
 * (path "/", XTransformPort=3003 query param). Caddy forwards based on the
 * query param.
 *
 * Exposes:
 *   - useChatSocket(): returns the singleton socket + connection status.
 *   - emit helpers: sendMessage, markRead, startTyping, stopTyping.
 *   - subscribe(event, cb): register a listener; auto-cleanup on unmount.
 *
 * The socket is created lazily on first use and authenticated via
 * `user:join` with the current user id (read from the zustand store).
 * When the user changes (login/logout), we re-join.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { useStore } from "@/lib/store";

// ---------------------------------------------------------------------------
// Types — mirror the chat-service protocol
// ---------------------------------------------------------------------------
export type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  image?: string | null;
  listingId: string | null;
  listingTitle: string | null;
  createdAt: string; // ISO
  sent: boolean; // true = I sent it; false = incoming
  read?: boolean;
};

export type TypingUpdate = {
  typerId: string;
  isTyping: boolean;
};

export type ReadUpdate = {
  partnerId: string;
};

type MessageSendPayload = {
  senderId: string;
  receiverId: string;
  content: string;
  image?: string | null;
  listingId?: string | null;
  listingTitle?: string | null;
};

// ---------------------------------------------------------------------------
// Singleton socket — one per browser tab
// ---------------------------------------------------------------------------
let socketRef: Socket | null = null;
let joinedUserId: string | null = null;
const listeners: Record<string, Set<(payload: any) => void>> = {};

function getSocket(): Socket {
  if (socketRef) return socketRef;

  // Deteksi environment:
  // - DEV langsung (localhost:3000): gateway Caddy TIDAK ada di port 3000,
  //   jadi XTransformPort tidak berfungsi → connect LANGSUNG ke localhost:3003.
  // - PROD / preview via gateway (port 81 / domain): pakai relative path
  //   "/?XTransformPort=3003" agar Caddy forward ke chat-service port 3003.
  const loc = typeof window !== "undefined" ? window.location : null;
  const isDevDirect =
    loc &&
    (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") &&
    loc.port === "3000";
  const socketUrl = isDevDirect ? "http://localhost:3003" : "/";
  const socketOpts: any = {
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  };
  if (!isDevDirect) {
    // Via gateway Caddy — XTransformPort di query supaya di-forward ke 3003.
    socketOpts.query = { XTransformPort: "3003" };
  }

  const socket = io(socketUrl, socketOpts);

  // Wire internal dispatchers — fan out to all registered listeners.
  const dispatch = (event: string, payload: any) => {
    const set = listeners[event];
    if (set) set.forEach((cb) => cb(payload));
  };

  socket.on("message:new", (p: ChatMessage) => dispatch("message:new", p));
  socket.on("message:read-update", (p: ReadUpdate) => dispatch("message:read-update", p));
  socket.on("typing:update", (p: TypingUpdate) => dispatch("typing:update", p));

  socket.on("connect", () => {
    // Re-join after reconnect if we have a user.
    if (joinedUserId) {
      socket.emit("user:join", { userId: joinedUserId });
    }
  });

  socketRef = socket;
  return socket;
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------
export function useChatSocket() {
  const user = useStore((s) => s.user);
  const [connected, setConnected] = useState(false);
  const subscriptionsRef = useRef<Array<() => void>>([]);

  // Lazily create the socket once.
  const socket = typeof window !== "undefined" ? getSocket() : null;

  // Track connection status.
  useEffect(() => {
    if (!socket) return;
    const onConn = () => {
      // Defer to avoid synchronous setState inside event handler.
      Promise.resolve().then(() => setConnected(true));
    };
    const onDisc = () => {
      Promise.resolve().then(() => setConnected(false));
    };
    socket.on("connect", onConn);
    socket.on("disconnect", onDisc);
    if (socket.connected) Promise.resolve().then(() => setConnected(true));
    return () => {
      socket.off("connect", onConn);
      socket.off("disconnect", onDisc);
    };
  }, [socket]);

  // Join the user's room whenever the logged-in user changes.
  useEffect(() => {
    if (!socket || !user?.id) return;
    joinedUserId = user.id;
    socket.emit("user:join", { userId: user.id });
    return () => {
      // On logout, we keep the socket alive but leave the user room.
      // (Socket.io rooms auto-cleanup on disconnect.)
    };
  }, [socket, user?.id]);

  // Cleanup all subscriptions on unmount.
  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach((off) => off());
      subscriptionsRef.current = [];
    };
  }, []);

  // -----------------------------------------------------------------------
  // emit helpers
  // -----------------------------------------------------------------------
  const sendMessage = useCallback(
    (payload: MessageSendPayload): Promise<{ ok: boolean; message?: ChatMessage; error?: string }> => {
      return new Promise((resolve) => {
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: "Socket not connected" });
          return;
        }
        socket.emit("message:send", payload, (ack: any) => resolve(ack || { ok: false, error: "No ack" }));
      });
    },
    [socket]
  );

  const markRead = useCallback(
    (userId: string, partnerId: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("message:read", { userId, partnerId });
    },
    [socket]
  );

  const startTyping = useCallback(
    (senderId: string, receiverId: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("typing:start", { senderId, receiverId });
    },
    [socket]
  );

  const stopTyping = useCallback(
    (senderId: string, receiverId: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("typing:stop", { senderId, receiverId });
    },
    [socket]
  );

  // -----------------------------------------------------------------------
  // subscribe helper — auto-cleans on unmount
  // -----------------------------------------------------------------------
  const subscribe = useCallback(
    <T = any>(event: "message:new" | "message:read-update" | "typing:update", cb: (payload: T) => void) => {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(cb as (p: any) => void);
      const off = () => {
        listeners[event]?.delete(cb as (p: any) => void);
      };
      subscriptionsRef.current.push(off);
      return off;
    },
    []
  );

  return {
    socket,
    connected,
    sendMessage,
    markRead,
    startTyping,
    stopTyping,
    subscribe,
  };
}
