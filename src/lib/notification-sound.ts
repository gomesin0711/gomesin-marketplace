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

// --- Preloaded HTMLAudioElement for the "iklan masuk" (new listing) ringtone ---
// TTS-generated Indonesian voice saying "iklan baru masuk" — plays when a
// new listing is published. Falls back to synthesized coin drop on error.
let listingAudioEl: HTMLAudioElement | null = null;
function getListingAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (listingAudioEl) return listingAudioEl;
  try {
    const el = new Audio("/sounds/iklan-masuk.wav");
    el.preload = "auto";
    el.volume = 0.9;
    listingAudioEl = el;
  } catch {
    listingAudioEl = null;
  }
  return listingAudioEl;
}

// --- Preloaded HTMLAudioElement for the "mesinku" chat ringtone ---
// TTS-generated Indonesian voice saying "mesin ku!" (cheerful, speed 1.3) —
// styled after the iconic Shopee notification jingle. A synthesized two-note
// ascending "ding-ding" chime plays right before the voice for the full
// Shopee-style effect. The `?v=3` query string busts the browser cache.
let chatAudioEl: HTMLAudioElement | null = null;
function getChatAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (chatAudioEl) return chatAudioEl;
  try {
    const el = new Audio("/sounds/mesinku-chat.wav?v=3");
    el.preload = "auto";
    el.volume = 0.9;
    chatAudioEl = el;
  } catch {
    chatAudioEl = null;
  }
  return chatAudioEl;
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
 * Unlock the AudioContext so it can play sounds instantly later.
 * Call this on first user interaction (click/touch/keydown).
 *
 * Also preloads the "iklan masuk" mp3 so it's ready to play instantly
 * when a new listing arrives.
 */
export function unlockNotificationSound() {
  if (unlocked) return;
  try {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Preload the listing + chat ringtone audio elements so they can play
    // instantly without a network fetch on the first notification.
    getListingAudio();
    getChatAudio();
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
 * Play a Shopee-style ascending two-note "ding-ding" chime using the Web Audio
 * API. The first note is a bright mid-high tone (~1318 Hz = E6) and the second
 * is a higher tone (~1760 Hz = A6) — a perfect fourth interval that mimics the
 * cheerful, attention-grabbing Shopee notification intro.
 *
 * Each note is a quick sine-wave pluck with a bell-like fast decay.
 *
 * @param startTime  When to start the first note (seconds, ctx-relative).
 * @param peakGain   Volume (0-1). Lower for the soft chat-open variant.
 */
function playShopeeChime(startTime: number, peakGain: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Two ascending notes: E6 (1318.51 Hz) then A6 (1760.00 Hz).
    // Each is a sine pluck with a tiny 2nd-harmonic overtone for sparkle.
    const notes = [
      { freq: 1318.51, t: 0.0, dur: 0.18 },
      { freq: 1760.0, t: 0.14, dur: 0.26 },
    ];
    for (const n of notes) {
      const t0 = startTime + n.t;
      // Fundamental (sine) — pure, clean tone.
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(n.freq, t0);
      g1.gain.setValueAtTime(0.0001, t0);
      g1.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.004);
      g1.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc1.connect(g1);
      g1.connect(ctx.destination);
      osc1.start(t0);
      osc1.stop(t0 + n.dur + 0.02);

      // Overtone (2x freq, sine) — adds a bell-like sparkle. Much quieter.
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(n.freq * 2, t0);
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(peakGain * 0.25, t0 + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur * 0.7);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t0);
      osc2.stop(t0 + n.dur * 0.7 + 0.02);
    }
  } catch {
    // ignore — audio is best-effort
  }
}

/**
 * Play the "mesinku" chat ringtone for incoming chat messages.
 * Plays a Shopee-style ascending "ding-ding" chime immediately, then the
 * cheerful TTS voice saying "mesin ku!" ~0.4s later — mimicking the iconic
 * Shopee notification jingle. Falls back to the synthesized coin drop if the
 * audio file fails to load/play.
 * Respects the user's chat sound preference (localStorage "mesinku-chat-sound").
 */
export function playNotificationSound() {
  if (!isSoundEnabled()) return;
  // Always play the Shopee-style chime intro first (synthesized, instant).
  const ctx = getAudioCtx();
  if (ctx) {
    playShopeeChime(ctx.currentTime, 0.35);
  }
  const el = getChatAudio();
  if (el) {
    try {
      el.currentTime = 0;
      el.volume = 0.9; // Full volume — chat is not open, user needs to be alerted.
      // Delay the voice slightly so it follows the chime intro (Shopee-style).
      window.setTimeout(() => {
        try {
          el.currentTime = 0;
          const p = el.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              // Autoplay blocked or decode error — fall back to synthesized sound.
              playCoinDropSound("chat");
            });
          }
        } catch {
          playCoinDropSound("chat");
        }
      }, 380);
      return;
    } catch {
      // fall through to synthesized fallback
    }
  }
  playCoinDropSound("chat");
}

/**
 * Play the "iklan baru masuk" ringtone when a NEW listing is detected.
 *
 * Uses the TTS-generated Indonesian voice file (`/public/sounds/iklan-masuk.wav`)
 * saying "iklan baru masuk". Falls back to the synthesized "listing" variant
 * if the audio element fails to load/play.
 *
 * Respects the user's chat sound preference (same toggle).
 */
export function playListingNotificationSound() {
  if (!isSoundEnabled()) return;
  const el = getListingAudio();
  if (el) {
    try {
      // Restart from the beginning if it's still playing.
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Autoplay blocked or decode error — fall back to synthesized sound.
          playCoinDropSound("listing");
        });
      }
      return;
    } catch {
      // fall through to synthesized fallback
    }
  }
  playCoinDropSound("listing");
}

/**
 * Play the "mesinku" chat ringtone (at lower volume) when a chat is
 * currently open. Plays a soft Shopee-style chime + the cheerful TTS voice
 * at reduced volume since the user is already viewing the conversation.
 * Falls back to a soft synthesized clink if the audio file is unavailable.
 */
export function playDingSound() {
  if (!isSoundEnabled()) return;
  // Soft chime intro (quieter than the full notification).
  const ctx = getAudioCtx();
  if (ctx) {
    playShopeeChime(ctx.currentTime, 0.18);
  }
  const el = getChatAudio();
  if (el) {
    try {
      el.currentTime = 0;
      el.volume = 0.5; // Lower volume — user is already viewing the chat.
      window.setTimeout(() => {
        try {
          el.currentTime = 0;
          const p = el.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              playClinkSoft();
            });
          }
        } catch {
          playClinkSoft();
        }
      }, 380);
      return;
    } catch {
      // fall through to synthesized fallback
    }
  }
  playClinkSoft();
}

/** Soft synthesized clink — fallback for playDingSound. */
function playClinkSoft() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
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
