"use client";

/**
 * CallOverlay — full-screen in-app call UI for GoMesin.
 *
 * Renders different layouts based on the call state:
 *   - calling:   outgoing call — "Memanggil..." + local preview + cancel
 *   - incoming:  incoming call — "Panggilan masuk" + accept/reject
 *   - connecting/connected: active call — remote video (full) + local (pip) + controls
 *   - ended:     brief "Panggilan berakhir" before cleanup
 *
 * No phone numbers — purely between GoMesin users via WebRTC.
 */

import { useEffect, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  Phone as PhoneIcon,
} from "lucide-react";
import type { CallState, CallInfo } from "@/lib/use-call";

type Props = {
  callState: CallState;
  callInfo: CallInfo | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onCancel: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
};

export function CallOverlay({
  callState,
  callInfo,
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  error,
  onAccept,
  onReject,
  onEnd,
  onCancel,
  onToggleMute,
  onToggleVideo,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);

  // Attach local stream to video element.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer (only when connected).
  useEffect(() => {
    if (callState !== "connected") {
      // Reset duration when not connected (deferred to avoid sync setState).
      const t = setTimeout(() => setDuration(0), 0);
      return () => clearTimeout(t);
    }
    const interval = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  if (callState === "idle" || !callInfo) return null;

  const isVideoCall = callInfo.type === "video";
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const initials = callInfo.partnerName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // ── Incoming call ──────────────────────────────────────────────────────
  if (callState === "incoming") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[#0f3d23] via-[#16A34A] to-[#0a2d18] p-6 text-white">
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-medium text-white/70">
            Panggilan {isVideoCall ? "Video" : "Suara"} Masuk
          </span>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/30" aria-hidden />
            <span className="absolute inset-0 animate-pulse rounded-full bg-white/20" aria-hidden />
            <div className="relative flex size-32 items-center justify-center overflow-hidden rounded-full ring-4 ring-white/40 bg-white/10">
              {callInfo.partnerImage ? (
                <img
                  src={callInfo.partnerImage}
                  alt={callInfo.partnerName}
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-white">{initials}</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold">{callInfo.partnerName}</p>
            <p className="mt-1 text-sm text-white/70">
              {isVideoCall ? "Panggilan video" : "Panggilan suara"}
            </p>
          </div>
        </div>
        <div className="flex w-full max-w-xs items-center justify-center gap-8">
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-2"
            aria-label="Tolak"
          >
            <span className="grid size-16 place-items-center rounded-full bg-red-500 shadow-lg transition hover:bg-red-600 active:scale-95">
              <PhoneOff className="size-7" />
            </span>
            <span className="text-xs text-white/70">Tolak</span>
          </button>
          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-2"
            aria-label="Terima"
          >
            <span className="grid size-16 place-items-center rounded-full bg-[#22C55E] shadow-lg transition hover:bg-[#16A34A] active:scale-95">
              {isVideoCall ? <Video className="size-7" /> : <Phone className="size-7" />}
            </span>
            <span className="text-xs text-white/70">Terima</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Outgoing call (ringing) ────────────────────────────────────────────
  if (callState === "calling") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[#0f3d23] via-[#16A34A] to-[#0a2d18] p-6 text-white">
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-medium text-white/70">
            {isVideoCall ? "Panggilan Video" : "Panggilan Suara"}
          </span>
          <button
            aria-label="Tutup"
            className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            onClick={onCancel}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/30" aria-hidden />
            <span className="absolute inset-0 animate-pulse rounded-full bg-white/20" aria-hidden />
            <div className="relative flex size-32 items-center justify-center overflow-hidden rounded-full ring-4 ring-white/40 bg-white/10">
              {callInfo.partnerImage ? (
                <img
                  src={callInfo.partnerImage}
                  alt={callInfo.partnerName}
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-white">{initials}</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold">{callInfo.partnerName}</p>
            <p className="mt-1 text-sm text-white/70">Memanggil…</p>
          </div>
          {error && (
            <p className="mt-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>
        {/* Local preview for video calls */}
        {isVideoCall && localStream && (
          <div className="absolute bottom-24 right-4 h-40 w-28 overflow-hidden rounded-xl border-2 border-white/30 bg-black shadow-xl md:h-48 md:w-36">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="size-full -scale-x-100 object-cover"
            />
          </div>
        )}
        <div className="flex w-full max-w-xs items-center justify-center">
          <button
            onClick={onCancel}
            className="grid size-16 place-items-center rounded-full bg-red-500 shadow-lg transition hover:bg-red-600 active:scale-95"
            aria-label="Batalkan"
          >
            <PhoneOff className="size-7" />
          </button>
        </div>
      </div>
    );
  }

  // ── Active call (connecting or connected) ──────────────────────────────
  const isActive = callState === "connecting" || callState === "connected";
  if (isActive) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
        {/* Remote video (full screen for video calls) or avatar (voice calls) */}
        {isVideoCall ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="size-full flex-1 object-cover"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-[#0f3d23] via-[#16A34A] to-[#0a2d18]">
            <div className="relative">
              {callState === "connected" && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/20" aria-hidden />
                  <span className="absolute inset-0 animate-pulse rounded-full bg-white/10" aria-hidden />
                </>
              )}
              <div className="relative flex size-40 items-center justify-center overflow-hidden rounded-full ring-4 ring-white/40 bg-white/10">
                {callInfo.partnerImage ? (
                  <img
                    src={callInfo.partnerImage}
                    alt={callInfo.partnerName}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-5xl font-bold text-white">{initials}</span>
                )}
              </div>
            </div>
            <p className="mt-6 text-2xl font-semibold">{callInfo.partnerName}</p>
            <p className="mt-1 text-sm text-white/70">
              {callState === "connected" ? formatDuration(duration) : "Menghubungkan…"}
            </p>
          </div>
        )}

        {/* Top bar — name + duration (video calls) */}
        {isVideoCall && (
          <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
            <div>
              <p className="text-base font-semibold">{callInfo.partnerName}</p>
              <p className="text-xs text-white/70">
                {callState === "connected" ? formatDuration(duration) : "Menghubungkan…"}
              </p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-lg bg-red-500/90 px-4 py-2 text-sm text-white shadow-lg">
            {error}
          </div>
        )}

        {/* Local video preview (picture-in-picture, video calls only) */}
        {isVideoCall && localStream && (
          <div className="absolute bottom-24 right-4 h-40 w-28 overflow-hidden rounded-xl border-2 border-white/30 bg-black shadow-xl md:h-48 md:w-36">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="size-full -scale-x-100 object-cover"
            />
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent p-6 md:gap-6">
          <button
            onClick={onToggleMute}
            className={`grid size-14 place-items-center rounded-full shadow-lg transition active:scale-95 ${
              isMuted ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
            }`}
            aria-label={isMuted ? "Nyalakan mikrofon" : "Bisukan"}
          >
            {isMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </button>
          {isVideoCall && (
            <button
              onClick={onToggleVideo}
              className={`grid size-14 place-items-center rounded-full shadow-lg transition active:scale-95 ${
                isVideoOff ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
              }`}
              aria-label={isVideoOff ? "Nyalakan kamera" : "Matikan kamera"}
            >
              {isVideoOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
            </button>
          )}
          <button
            onClick={onEnd}
            className="grid size-16 place-items-center rounded-full bg-red-500 shadow-lg transition hover:bg-red-600 active:scale-95"
            aria-label="Akhiri panggilan"
          >
            <PhoneOff className="size-7" />
          </button>
        </div>
      </div>
    );
  }

  // ── Ended (brief state) ────────────────────────────────────────────────
  if (callState === "ended") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-[#0f3d23] via-[#16A34A] to-[#0a2d18] p-6 text-white">
        <PhoneOff className="size-16 text-white/70" />
        <p className="mt-4 text-xl font-semibold">Panggilan berakhir</p>
      </div>
    );
  }

  return null;
}
