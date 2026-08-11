/**
 * Notification sound utility — plays "Go mesin!" ringtone instantly when a
 * chat message arrives, like WhatsApp.
 *
 * Browser autoplay policy blocks audio.play() until the user has interacted
 * with the page. To work around this, we:
 *   1. Preload a SINGLE Audio element (reused, not recreated each time).
 *   2. "Unlock" it on the first user gesture (click/touch/keydown) by playing
 *      it muted briefly. After that, play() works instantly without gesture.
 *   3. On message arrival, reset currentTime to 0 and play — instant sound.
 *
 * Call `unlockNotificationSound()` once at app level (e.g. in a root effect),
 * and `playNotificationSound()` whenever a message arrives.
 *
 * --- Chat-open behavior ---
 * When the user is actively viewing a chat conversation (chat widget/panel
 * open), incoming messages should NOT play the full ringtone — only a soft
 * short "ding" (generated via Web Audio API, no asset file needed).
 * When the chat is NOT open, the full "Go mesin!" ringtone plays.
 *
 * Call `setChatOpen(true)` whenever a chat conversation becomes visible, and
 * `setChatOpen(false)` when it closes. The header's global message handler
 * checks this flag to decide which sound to play.
 */

let audioEl: HTMLAudioElement | null = null;
let listingAudioEl: HTMLAudioElement | null = null;
let unlocked = false;

// --- Web Audio API context for the short "ding" sound ---
let audioCtx: AudioContext | null = null;

// --- Module-level flag: is the user currently viewing an open chat? ---
let chatOpen = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audioEl) return audioEl;
  try {
    audioEl = new Audio("/sounds/go-mesin.wav");
    audioEl.preload = "auto";
    audioEl.volume = 1;
  } catch {
    audioEl = null;
  }
  return audioEl;
}

/**
 * Separate Audio element for the "Iklan baru nih" new-listing ringtone.
 * Kept independent from the chat sound so volume/position don't clash.
 */
function getListingAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (listingAudioEl) return listingAudioEl;
  try {
    listingAudioEl = new Audio("/sounds/iklan-baru.wav");
    listingAudioEl.preload = "auto";
    listingAudioEl.volume = 1;
  } catch {
    listingAudioEl = null;
  }
  return listingAudioEl;
}

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

/**
 * Unlock the audio element so it can play instantly later.
 * Call this on first user interaction (click/touch/keydown).
 */
export function unlockNotificationSound() {
  if (unlocked) return;
  const el = getAudio();
  if (!el) return;
  // Play muted briefly to satisfy autoplay policy, then mark as unlocked.
  try {
    el.muted = true;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        unlocked = true;
      }).catch(() => {
        el.muted = false;
        // Still mark unlocked — the gesture was registered; next play may work.
        unlocked = true;
      });
    } else {
      el.muted = false;
      unlocked = true;
    }
  } catch {
    el.muted = false;
    unlocked = true;
  }
  // Also unlock the "Iklan baru nih" listing audio element.
  try {
    const lEl = getListingAudio();
    if (lEl) {
      lEl.muted = true;
      const lp = lEl.play();
      if (lp && typeof lp.then === "function") {
        lp.then(() => { lEl.pause(); lEl.currentTime = 0; lEl.muted = false; }).catch(() => { lEl.muted = false; });
      } else {
        lEl.muted = false;
      }
    }
  } catch {
    // ignore
  }
  // Also unlock the Web Audio API AudioContext (for the ding sound).
  // A user gesture allows us to create & resume an AudioContext.
  try {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch {
    // ignore
  }
}

function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem("gomesin-chat-sound") !== "off";
  } catch {
    return true;
  }
}

/**
 * Play the "Go mesin!" notification sound instantly.
 * Must be called after the user has interacted with the page at least once
 * (unlockNotificationSound handles that automatically on first gesture).
 * Respects the user's chat sound preference (localStorage "gomesin-chat-sound").
 */
export function playNotificationSound() {
  if (!isSoundEnabled()) return;
  const el = getAudio();
  if (!el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.catch(() => {
        // Autoplay still blocked (no interaction yet) — try unlocking on next gesture.
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Play the "Iklan baru nih" ringtone when a NEW listing is detected.
 * Uses a separate audio element (/sounds/iklan-baru.wav) so it doesn't
 * interfere with the chat notification sound.
 * Respects the user's chat sound preference (same toggle).
 */
export function playListingNotificationSound() {
  if (!isSoundEnabled()) return;
  const el = getListingAudio();
  if (!el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.catch(() => {
        // Autoplay still blocked (no interaction yet) — try unlocking on next gesture.
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Play a short soft "ding" notification sound (≈300ms) via the Web Audio API.
 * No audio file needed — synthesized as a descending sine-wave tone.
 * Used when a chat is currently open (so the user is already looking at it)
 * and a new message arrives — a soft ding is less intrusive than the full
 * ringtone.
 */
export function playDingSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    // Resume if suspended (shouldn't happen after unlock, but just in case).
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    // Start at E6 (1318.51 Hz) — a pleasant notification ding.
    osc.frequency.setValueAtTime(1318.51, now);
    // Slide down to A5 (880 Hz) over 150ms for a gentle "ding-dong" feel.
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    // Quick attack (10ms) then exponential decay to silence over 350ms.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // ignore — audio is best-effort, not critical
  }
}

/**
 * Check if chat notification sound is enabled (default: on).
 */
export function isChatSoundEnabled(): boolean {
  return isSoundEnabled();
}

/**
 * Enable/disable chat notification sound.
 */
export function setChatSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("gomesin-chat-sound", enabled ? "on" : "off");
  } catch {
    // ignore
  }
}

/**
 * Set whether the user is currently viewing an open chat conversation.
 * When true, incoming messages play a soft "ding" instead of the full
 * ringtone. When false (chat closed / not visible), the full ringtone plays.
 *
 * Call this from:
 *   - profile.tsx Pesan panel (when activeChatId is set)
 *   - chat-widget.tsx (when the floating chat dialog is open)
 */
export function setChatOpen(isOpen: boolean) {
  chatOpen = isOpen;
}

/**
 * Returns true if the user is currently viewing an open chat conversation.
 * Used by the header's global message:new handler to decide which sound to play.
 */
export function isChatOpen(): boolean {
  return chatOpen;
}

let globalListenersAttached = false;

/**
 * Attach one-time global listeners to unlock audio on first user interaction.
 * Safe to call multiple times — only attaches once.
 */
export function setupNotificationSoundUnlock() {
  if (typeof window === "undefined") return;
  if (globalListenersAttached) return;
  globalListenersAttached = true;
  const unlock = () => {
    unlockNotificationSound();
    // Remove listeners after first successful unlock to avoid overhead.
    window.removeEventListener("click", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  // Use capture phase + once to catch the very first interaction.
  window.addEventListener("click", unlock, { capture: true, once: true });
  window.addEventListener("touchstart", unlock, { capture: true, once: true });
  window.addEventListener("keydown", unlock, { capture: true, once: true });
}
