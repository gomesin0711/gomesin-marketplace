/**
 * Notification sound utility — plays a synthesized "coin drop" sound
 * instantly when a chat message or new listing arrives.
 *
 * The sound is generated at runtime via the Web Audio API (no audio asset
 * file needed). It mimics a metallic coin bouncing on a hard surface:
 *   - Multiple inharmonic partials (metallic timbre)
 *   - 3-4 successive "clinks" with decreasing volume (bounces)
 *   - Fast exponential decay (bright, metallic character)
 *
 * Browser autoplay policy blocks audio.play() until the user has interacted
 * with the page. To work around this, we "unlock" the AudioContext on the
 * first user gesture (click/touch/keydown) by resuming it. After that,
 * sounds play instantly without a gesture.
 *
 * Call `unlockNotificationSound()` once at app level (e.g. in a root effect),
 * and `playNotificationSound()` whenever a message arrives.
 *
 * --- Chat-open behavior ---
 * When the user is actively viewing a chat conversation (chat widget/panel
 * open), incoming messages play a single soft "clink" (very short, quiet).
 * When the chat is NOT open, the full multi-bounce "coin drop" sound plays.
 *
 * Call `setChatOpen(true)` whenever a chat conversation becomes visible, and
 * `setChatOpen(false)` when it closes.
 */

let audioCtx: AudioContext | null = null;
let unlocked = false;

// --- Module-level flag: is the user currently viewing an open chat? ---
let chatOpen = false;

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
 * Unlock the AudioContext so it can play sounds instantly later.
 * Call this on first user interaction (click/touch/keydown).
 */
export function unlockNotificationSound() {
  if (unlocked) return;
  try {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    unlocked = true;
  } catch {
    // ignore
  }
}

const CHAT_SOUND_KEY = "mesinku-chat-sound";
const LEGACY_SOUND_KEY = "gomesin-chat-sound";

function migrateLegacySoundKey() {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(LEGACY_SOUND_KEY);
    if (legacy !== null && window.localStorage.getItem(CHAT_SOUND_KEY) === null) {
      window.localStorage.setItem(CHAT_SOUND_KEY, legacy);
      window.localStorage.removeItem(LEGACY_SOUND_KEY);
    }
  } catch {
    // ignore
  }
}

function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    migrateLegacySoundKey();
    return window.localStorage.getItem(CHAT_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Synthesize a single metallic "clink" of a coin.
 *
 * Uses 3 oscillators at inharmonic frequency ratios (1, 1.42, 2.11) with
 * triangle waves — the inharmonicity is what gives metallic objects their
 * characteristic "ringing" timbre (unlike a bell which has harmonic partials).
 *
 * @param ctx      Web Audio API context
 * @param startTime  When to start the clink (seconds, relative to ctx.currentTime)
 * @param freq     Fundamental frequency in Hz (e.g. 2800)
 * @param peakGain Peak volume (0-1). Lower for quieter bounces.
 * @param duration Total decay time in seconds.
 */
function playClink(
  ctx: AudioContext,
  startTime: number,
  freq: number,
  peakGain: number,
  duration: number
) {
  // Inharmonic partial ratios — give a metallic, bell-like timbre.
  const partials = [1, 1.42, 2.11];
  const partialGains = [1.0, 0.45, 0.22]; // higher partials are quieter

  for (let i = 0; i < partials.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq * partials[i], startTime);
    // Slight downward pitch slide — mimics a coin settling (energy loss).
    osc.frequency.exponentialRampToValueAtTime(
      freq * partials[i] * 0.97,
      startTime + duration
    );

    // Quick attack (1ms) then exponential decay to silence.
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain * partialGains[i], startTime + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

/**
 * Play the full "coin drop" notification sound — a coin bouncing on a hard
 * surface, with 3-4 successive clinks of decreasing volume.
 *
 * @param variant "chat" (slightly higher, 4 bounces) or "listing" (lower, 3 bounces)
 */
function playCoinDropSound(variant: "chat" | "listing" = "chat") {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    if (variant === "chat") {
      // Chat coin drop: bright, 4 bounces, ~350ms total.
      // Higher fundamental (~2900 Hz) for a lively, attention-grabbing feel.
      playClink(ctx, now + 0.000, 2900, 0.32, 0.14);
      playClink(ctx, now + 0.085, 2700, 0.22, 0.11);
      playClink(ctx, now + 0.165, 2500, 0.14, 0.09);
      playClink(ctx, now + 0.235, 2350, 0.08, 0.07);
    } else {
      // Listing coin drop: slightly lower, 3 bounces, ~300ms total.
      // Lower fundamental (~2400 Hz) for a distinct, fuller feel.
      playClink(ctx, now + 0.000, 2400, 0.34, 0.16);
      playClink(ctx, now + 0.095, 2200, 0.20, 0.12);
      playClink(ctx, now + 0.185, 2050, 0.11, 0.10);
    }
  } catch {
    // ignore — audio is best-effort
  }
}

/**
 * Play the "coin drop" notification sound for incoming chat messages.
 * Respects the user's chat sound preference (localStorage "mesinku-chat-sound").
 */
export function playNotificationSound() {
  if (!isSoundEnabled()) return;
  playCoinDropSound("chat");
}

/**
 * Play the "coin drop" notification sound when a NEW listing is detected.
 * Uses a slightly lower variant so it's distinguishable from the chat sound.
 * Respects the user's chat sound preference (same toggle).
 */
export function playListingNotificationSound() {
  if (!isSoundEnabled()) return;
  playCoinDropSound("listing");
}

/**
 * Play a single soft "clink" sound (~120ms) via the Web Audio API.
 * Used when a chat is currently open (so the user is already looking at it)
 * and a new message arrives — a single soft clink is less intrusive than
 * the full multi-bounce coin drop.
 */
export function playDingSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Single soft clink — low volume, short decay.
    playClink(ctx, ctx.currentTime, 2600, 0.14, 0.12);
  } catch {
    // ignore — audio is best-effort
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
    window.localStorage.setItem(CHAT_SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // ignore
  }
}

/**
 * Set whether the user is currently viewing an open chat conversation.
 * When true, incoming messages play a soft "clink" instead of the full
 * coin drop. When false (chat closed / not visible), the full coin drop plays.
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
