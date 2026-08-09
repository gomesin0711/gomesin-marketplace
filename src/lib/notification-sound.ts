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
 */

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;

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
}

/**
 * Play the "Go mesin!" notification sound instantly.
 * Must be called after the user has interacted with the page at least once
 * (unlockNotificationSound handles that automatically on first gesture).
 * Respects the user's chat sound preference (localStorage "gomesin-chat-sound").
 */
export function playNotificationSound() {
  // Respect user preference — if chat sound is disabled in settings, don't play.
  if (typeof window !== "undefined") {
    try {
      const enabled = window.localStorage.getItem("gomesin-chat-sound");
      if (enabled === "off") return;
    } catch {
      // localStorage not available — proceed.
    }
  }
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
 * Check if chat notification sound is enabled (default: on).
 */
export function isChatSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem("gomesin-chat-sound") !== "off";
  } catch {
    return true;
  }
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
