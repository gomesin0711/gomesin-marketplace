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

  // ALWAYS use the Caddy gateway (relative path "/?XTransformPort=3003").
  // The browser cannot connect directly to localhost:3003 (cross-origin port
  // blocking), so we must go through the gateway which proxies based on the
  // XTransformPort query param. This works for both the sandbox preview and
  // production deployments behind the same gateway.
  const socketUrl = "/";
  const socketOpts: any = {
    // Match the chat-service's `path: "/"` (NOT the default "/socket.io/").
    // The Caddy gateway forwards based on the XTransformPort query param, so
    // all requests must go to "/" with the query param attached.
    path: "/",
    // Websocket FIRST for true realtime delivery (no polling delay).
    // Falls back to polling if websocket is blocked/unavailable.
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    // XTransformPort tells the Caddy gateway to forward this request to
    // the chat-service mini-service on port 3003.
    query: { XTransformPort: "3003" },
  };

  const socket = io(socketUrl, socketOpts);

  // Wire internal dispatchers — fan out to all registered listeners.
  const dispatch = (event: string, payload: any) => {
    const set = listeners[event];
    if (set) set.forEach((cb) => cb(payload));
  };

  socket.on("message:new", (p: ChatMessage) => dispatch("message:new", p));
  socket.on("message:read-update", (p: ReadUpdate) => dispatch("message:read-update", p));
  socket.on("typing:update", (p: TypingUpdate) => dispatch("typing:update", p));
  socket.on("listings:invalidate", (p: any) => dispatch("listings:invalidate", p));
  socket.on("listing:new", (p: any) => dispatch("listing:new", p));
  socket.on("listing:pending", (p: any) => dispatch("listing:pending", p));
  // In-app call signaling events (WebRTC relay).
  socket.on("call:incoming", (p: any) => dispatch("call:incoming", p));
  socket.on("call:accepted", (p: any) => dispatch("call:accepted", p));
  socket.on("call:rejected", (p: any) => dispatch("call:rejected", p));
  socket.on("call:ended", (p: any) => dispatch("call:ended", p));
  socket.on("call:signal", (p: any) => dispatch("call:signal", p));

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
    <T = any>(
      event:
        | "message:new"
        | "message:read-update"
        | "typing:update"
        | "listings:invalidate"
        | "listing:new"
        | "listing:pending"
        | "call:incoming"
        | "call:accepted"
        | "call:rejected"
        | "call:ended"
        | "call:signal",
      cb: (payload: T) => void
    ) => {
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

  // -----------------------------------------------------------------------
  // in-app call emit helpers (WebRTC signaling)
  // -----------------------------------------------------------------------
  const callRequest = useCallback(
    (payload: { from: string; fromName: string; fromImage: string | null; to: string; type: "voice" | "video"; callId: string }) => {
      if (!socket || !socket.connected) return;
      socket.emit("call:request", payload);
    },
    [socket]
  );

  const callAccept = useCallback(
    (from: string, to: string, callId: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("call:accept", { from, to, callId });
    },
    [socket]
  );

  const callReject = useCallback(
    (from: string, to: string, callId: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("call:reject", { from, to, callId });
    },
    [socket]
  );

  const callEnd = useCallback(
    (from: string, to: string, callId: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("call:end", { from, to, callId });
    },
    [socket]
  );

  const callSignal = useCallback(
    (from: string, to: string, callId: string, signal: any) => {
      if (!socket || !socket.connected) return;
      socket.emit("call:signal", { from, to, callId, signal });
    },
    [socket]
  );

  // Broadcast a listings change to ALL connected clients (admin → everyone).
  // Used after delete / publish / violation toggle so any open Beranda
  // refetches its listing queries in realtime.
  const broadcastListings = useCallback(
    (): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: "Socket not connected" });
          return;
        }
        socket.emit(
          "listings:broadcast",
          { kind: "invalidate" },
          (ack: any) => resolve(ack || { ok: false, error: "No ack" })
        );
      });
    },
    [socket]
  );

  // Broadcast a freshly published listing to ALL connected clients.
  // Used by the admin's "Publikasi" action so the homepage's "Iklan Baru"
  // section AND the notification bell update instantly (no polling delay).
  // (Server-side /api/admin/listings PATCH also fires this via the
  // chat-service's /internal/broadcast HTTP endpoint — this client-side
  // emit is a redundancy for when the server-side call fails but the
  // admin's socket is still connected.)
  const broadcastListingNew = useCallback(
    (listing: any): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: "Socket not connected" });
          return;
        }
        socket.emit(
          "listing:broadcast-new",
          { listing },
          (ack: any) => resolve(ack || { ok: false, error: "No ack" })
        );
      });
    },
    [socket]
  );

  return {
    socket,
    connected,
    sendMessage,
    markRead,
    startTyping,
    stopTyping,
    subscribe,
    broadcastListings,
    broadcastListingNew,
    callRequest,
    callAccept,
    callReject,
    callEnd,
    callSignal,
  };
}
