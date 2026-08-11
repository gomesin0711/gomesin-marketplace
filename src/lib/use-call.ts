"use client";

/**
 * useCall — WebRTC in-app voice/video call hook.
 *
 * Enables voice & video calls BETWEEN GoMesin users only — no phone numbers.
 * Uses WebRTC for peer-to-peer media (audio/video) and the existing socket.io
 * chat-service (port 3003) for signaling (request, accept, reject, end,
 * SDP offer/answer, ICE candidates).
 *
 * Call flow:
 *   1. Caller clicks call → startCall() → getUserMedia (local preview) →
 *      emit call:request → wait for call:accepted.
 *   2. Callee receives call:incoming → shows incoming dialog → acceptCall() →
 *      getUserMedia → emit call:accept.
 *   3. Caller receives call:accepted → creates RTCPeerConnection → creates
 *      offer → sends via call:signal.
 *   4. Callee receives offer → creates answer → sends via call:signal.
 *   5. ICE candidates exchanged via call:signal → connection established.
 *   6. Either party can endCall() → emit call:end → both sides cleanup.
 *
 * Requirements:
 *   - HTTPS or localhost (getUserMedia requires secure context).
 *   - Microphone/camera permissions.
 *   - Socket.io chat-service running (for signaling).
 *   - STUN server for NAT traversal (Google's free STUN servers are used;
 *     no TURN server — calls may fail on symmetric NATs, but work for most
 *     home/office networks).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useChatSocket } from "./use-chat-socket";
import { useStore } from "./store";

export type CallState =
  | "idle"
  | "calling" // outgoing — waiting for callee to accept
  | "incoming" // incoming — waiting for user to accept/reject
  | "connecting" // accepted — WebRTC negotiation in progress
  | "connected" // call active — media flowing
  | "ended"; // call ended — brief state before cleanup

export type CallInfo = {
  callId: string;
  type: "voice" | "video";
  partnerId: string;
  partnerName: string;
  partnerImage: string | null;
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useCall() {
  const user = useStore((s) => s.user);
  const {
    subscribe,
    callRequest,
    callAccept,
    callReject,
    callEnd,
    callSignal,
  } = useChatSocket();

  const [callState, setCallState] = useState<CallState>("idle");
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs — avoid stale closures in socket event handlers.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callInfoRef = useRef<CallInfo | null>(null);
  const callStateRef = useRef<CallState>("idle");
  // Tracks whether the callee accepted before our getUserMedia resolved.
  // If so, we create the offer as soon as the local stream is ready.
  const acceptedWhileGettingMediaRef = useRef(false);
  // Ref to createOffer — avoids temporal-dead-zone lint error (createOffer
  // is defined after startCall but referenced inside startCall's callback).
  const createOfferRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // ── Cleanup media + peer connection ────────────────────────────────────
  const cleanup = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallInfo(null);
    callInfoRef.current = null;
    setCallState("idle");
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  // ── Start an outgoing call ─────────────────────────────────────────────
  const startCall = useCallback(
    async (
      partnerId: string,
      partnerName: string,
      partnerImage: string | null,
      type: "voice" | "video"
    ) => {
      if (!user) {
        setError("Anda harus login");
        return;
      }
      if (callStateRef.current !== "idle") return; // already in a call

      const callId =
        "call_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const info: CallInfo = {
        callId,
        type,
        partnerId,
        partnerName,
        partnerImage,
      };
      callInfoRef.current = info;
      setCallInfo(info);
      setCallState("calling");
      setError(null);

      try {
        // Send the call request FIRST so the callee sees the incoming call
        // dialog immediately, even while we're still getting local media.
        callRequest({
          from: user.id,
          fromName: user.name || "Pengguna GoMesin",
          fromImage: user.logoImage || null,
          to: partnerId,
          type,
          callId,
        });

        // Get local media for the caller's preview.
        // Add a 10s timeout — getUserMedia can hang if the browser shows a
        // permission prompt that the user doesn't interact with (e.g. in
        // an iframe or headless context).
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === "video",
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new DOMException("timeout", "TimeoutError")), 10000)
          ),
        ]);
        localStreamRef.current = stream;
        setLocalStream(stream);

        // If the callee already accepted while we were getting media, create
        // the offer now (race condition: call:accepted arrived before
        // getUserMedia resolved).
        if (acceptedWhileGettingMediaRef.current) {
          acceptedWhileGettingMediaRef.current = false;
          createOfferRef.current();
        }
      } catch (e: any) {
        const msg =
          e?.name === "NotAllowedError"
            ? "Izinkan akses mikrofon/kamera di browser"
            : e?.name === "NotFoundError"
            ? "Mikrofon/kamera tidak ditemukan"
            : e?.name === "TimeoutError"
            ? "Timeout — izinkan akses mikrofon/kamera"
            : "Gagal mengakses kamera/mikrofon";
        // Show the error in the overlay — don't cleanup immediately so the
        // user can see WHY the call failed. They can dismiss via cancel.
        setError(msg);
        // Notify the partner that the call is over (cancels their incoming
        // call dialog).
        callEnd(user.id, partnerId, callId);
      }
    },
    [user, callRequest, callEnd, cleanup]
  );

  // ── Create peer connection + send offer (caller side, after accept) ────
  const createOffer = useCallback(async () => {
    if (!user || !callInfoRef.current || !localStreamRef.current) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks to the connection.
    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // Set up remote stream to receive the callee's tracks.
    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remote.addTrack(track);
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        callSignal(
          user.id,
          callInfoRef.current!.partnerId,
          callInfoRef.current!.callId,
          { kind: "ice", candidate: event.candidate }
        );
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        setCallState("connected");
      } else if (state === "disconnected" || state === "failed") {
        setError("Koneksi terputus");
        setTimeout(() => cleanup(), 1500);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      callSignal(
        user.id,
        callInfoRef.current.partnerId,
        callInfoRef.current.callId,
        { kind: "offer", sdp: offer }
      );
      setCallState("connecting");
    } catch (e: any) {
      setError("Gagal memulai panggilan");
      cleanup();
    }
  }, [user, callSignal, cleanup]);

  // Keep the ref in sync so startCall can call createOffer without a
  // temporal-dead-zone lint error.
  useEffect(() => {
    createOfferRef.current = createOffer;
  }, [createOffer]);

  // ── Accept an incoming call ────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    const info = callInfoRef.current;
    if (!user || !info) return;

    setCallState("connecting");
    setError(null);

    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: true,
          video: info.type === "video",
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DOMException("timeout", "TimeoutError")), 10000)
        ),
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Notify the caller that we accepted — they will then create the offer.
      callAccept(user.id, info.partnerId, info.callId);
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Izinkan akses mikrofon/kamera di browser"
          : e?.name === "TimeoutError"
          ? "Timeout — izinkan akses mikrofon/kamera"
          : "Gagal mengakses kamera/mikrofon";
      setError(msg);
      // Reject the call since we can't get media.
      callReject(user.id, info.partnerId, info.callId);
      setTimeout(() => cleanup(), 2000);
    }
  }, [user, callAccept, callReject, cleanup]);

  // ── Reject an incoming call ────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    const info = callInfoRef.current;
    if (!user || !info) return;
    callReject(user.id, info.partnerId, info.callId);
    cleanup();
  }, [user, callReject, cleanup]);

  // ── End an active call ─────────────────────────────────────────────────
  const endCall = useCallback(() => {
    const info = callInfoRef.current;
    if (!user || !info) {
      cleanup();
      return;
    }
    callEnd(user.id, info.partnerId, info.callId);
    cleanup();
  }, [user, callEnd, cleanup]);

  // ── Cancel an outgoing call (before it's accepted) ─────────────────────
  const cancelCall = useCallback(() => {
    const info = callInfoRef.current;
    if (!user || !info) {
      cleanup();
      return;
    }
    callEnd(user.id, info.partnerId, info.callId);
    cleanup();
  }, [user, callEnd, cleanup]);

  // ── Toggle mute ────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  // ── Toggle video on/off ────────────────────────────────────────────────
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  }, []);

  // ── Subscribe to call events (socket.io signaling) ─────────────────────
  useEffect(() => {
    if (!user) return;

    // Incoming call request from another user.
    const offIncoming = subscribe("call:incoming", (p: any) => {
      if (callStateRef.current !== "idle") {
        // Already in a call — auto-reject.
        callReject(user.id, p.from, p.callId);
        return;
      }
      const info: CallInfo = {
        callId: p.callId,
        type: p.type,
        partnerId: p.from,
        partnerName: p.fromName || "Pengguna GoMesin",
        partnerImage: p.fromImage || null,
      };
      callInfoRef.current = info;
      setCallInfo(info);
      setCallState("incoming");
    });

    // Callee accepted our call — create the WebRTC offer.
    const offAccepted = subscribe("call:accepted", (p: any) => {
      if (callStateRef.current === "calling") {
        // If local media is ready, create the offer now. Otherwise, flag it
        // so the offer is created as soon as getUserMedia resolves.
        if (localStreamRef.current) {
          createOfferRef.current();
        } else {
          acceptedWhileGettingMediaRef.current = true;
        }
      }
    });

    // Callee rejected our call.
    const offRejected = subscribe("call:rejected", (p: any) => {
      if (callStateRef.current === "calling") {
        setError("Panggilan ditolak");
        setTimeout(() => cleanup(), 2000);
      }
    });

    // Other party ended the call.
    const offEnded = subscribe("call:ended", (p: any) => {
      cleanup();
    });

    // WebRTC signaling — offer, answer, ICE candidates.
    const offSignal = subscribe("call:signal", async (p: any) => {
      const pc = pcRef.current;
      const info = callInfoRef.current;
      if (!pc || !info || !user) return;

      const { signal } = p;
      try {
        if (signal.kind === "offer") {
          // Callee receives the offer — set remote desc, create answer.
          await pc.setRemoteDescription(signal.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          callSignal(user.id, info.partnerId, info.callId, {
            kind: "answer",
            sdp: answer,
          });
          setCallState("connecting");
        } else if (signal.kind === "answer") {
          // Caller receives the answer — set remote desc.
          await pc.setRemoteDescription(signal.sdp);
        } else if (signal.kind === "ice") {
          // Either side receives an ICE candidate.
          if (pc.remoteDescription) {
            await pc.addIceCandidate(signal.candidate);
          }
        }
      } catch (e: any) {
        // Silently ignore — ICE errors are non-fatal in most cases.
      }
    });

    return () => {
      offIncoming();
      offAccepted();
      offRejected();
      offEnded();
      offSignal();
    };
  }, [user, subscribe, callSignal, callReject, cleanup]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    callState,
    callInfo,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    cancelCall,
    toggleMute,
    toggleVideo,
    cleanup,
  };
}