/**
 * Render the coin drop notification sound to a WAV file for preview.
 *
 * This replicates the EXACT same synthesis logic as src/lib/notification-sound.ts
 * (playClink + playCoinDropSound) but renders offline to a WAV file so the
 * user can listen to what the notification sounds like.
 *
 * Usage: bun run scripts/render-coin-drop-preview.ts
 * Output: public/sounds/preview-coin-drop.wav
 */

// ─── WAV writer ──────────────────────────────────────────────────────────────

function writeWav(filename: string, samples: Float32Array, sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);        // subchunk size
  buffer.writeUInt16LE(1, 20);          // audio format = PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Convert float samples [-1, 1] to 16-bit signed PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), offset);
    offset += 2;
  }

  const fs = require("fs");
  fs.writeFileSync(filename, buffer);
}

// ─── Synthesis (mirrors src/lib/notification-sound.ts) ────────────────────────

const SAMPLE_RATE = 44100;

/** Generate a triangle wave sample at phase [0, 1). */
function triangle(phase: number): number {
  const p = phase - Math.floor(phase); // wrap to [0, 1)
  return 2 * Math.abs(2 * p - 1) - 1;
}

/**
 * Render a single "clink" of a coin into the output buffer.
 * Mirrors playClink() in notification-sound.ts:
 *   - 3 oscillators at inharmonic partial ratios [1, 1.42, 2.11]
 *   - Triangle wave (metallic timbre)
 *   - Slight downward pitch slide (0.97x over duration)
 *   - Quick attack (1ms) + exponential decay
 */
function renderClink(
  out: Float32Array,
  startSample: number,
  freq: number,
  peakGain: number,
  durationSec: number
) {
  const partials = [1, 1.42, 2.11];
  const partialGains = [1.0, 0.45, 0.22];
  const durationSamples = Math.floor(durationSec * SAMPLE_RATE);
  const attackSamples = Math.floor(0.001 * SAMPLE_RATE); // 1ms attack

  for (let i = 0; i < partials.length; i++) {
    const startFreq = freq * partials[i];
    const endFreq = startFreq * 0.97; // pitch slide down
    const partialGain = peakGain * partialGains[i];

    for (let j = 0; j < durationSamples; j++) {
      const idx = startSample + j;
      if (idx >= out.length) break;

      const t = j / SAMPLE_RATE; // seconds into this clink
      const progress = j / durationSamples;

      // Linear pitch slide (exponential in the original, but linear is close enough for preview)
      const freq = startFreq + (endFreq - startFreq) * progress;

      // Phase accumulator
      const phase = (2 * Math.PI * freq * t) % (2 * Math.PI);
      const sample = triangle(phase / (2 * Math.PI));

      // Gain envelope: quick attack (1ms) then exponential decay
      let gain: number;
      if (j < attackSamples) {
        // Attack: exponential rise from 0.0001 to peakGain
        const attackProgress = j / attackSamples;
        gain = 0.0001 * Math.pow(partialGain / 0.0001, attackProgress);
      } else {
        // Decay: exponential from peakGain to 0.0001
        const decayProgress = (j - attackSamples) / (durationSamples - attackSamples);
        gain = partialGain * Math.pow(0.0001 / partialGain, decayProgress);
      }

      out[idx] += sample * gain;
    }
  }
}

/**
 * Render the full "coin drop" sound — mirrors playCoinDropSound("chat").
 * 4 clinks with decreasing volume, mimicking a coin bouncing on a hard surface.
 */
function renderCoinDropChat(out: Float32Array, startTimeSec: number) {
  // Same parameters as playCoinDropSound("chat") in notification-sound.ts
  renderClink(out, Math.floor(startTimeSec * SAMPLE_RATE), 2900, 0.32, 0.14);
  renderClink(out, Math.floor((startTimeSec + 0.085) * SAMPLE_RATE), 2700, 0.22, 0.11);
  renderClink(out, Math.floor((startTimeSec + 0.165) * SAMPLE_RATE), 2500, 0.14, 0.09);
  renderClink(out, Math.floor((startTimeSec + 0.235) * SAMPLE_RATE), 2350, 0.08, 0.07);
}

/** Render the "listing" coin drop variant — mirrors playCoinDropSound("listing"). */
function renderCoinDropListing(out: Float32Array, startTimeSec: number) {
  renderClink(out, Math.floor(startTimeSec * SAMPLE_RATE), 2400, 0.34, 0.16);
  renderClink(out, Math.floor((startTimeSec + 0.095) * SAMPLE_RATE), 2200, 0.20, 0.12);
  renderClink(out, Math.floor((startTimeSec + 0.185) * SAMPLE_RATE), 2050, 0.11, 0.10);
}

/** Render the soft "ding" (single clink) — mirrors playDingSound(). */
function renderDing(out: Float32Array, startTimeSec: number) {
  renderClink(out, Math.floor(startTimeSec * SAMPLE_RATE), 2600, 0.14, 0.12);
}

// ─── Main: render all 3 variants into one preview WAV ────────────────────────

const TOTAL_DURATION_SEC = 2.5; // enough for all 3 variants with gaps
const totalSamples = Math.floor(TOTAL_DURATION_SEC * SAMPLE_RATE);
const buffer = new Float32Array(totalSamples);

// 1. Chat coin drop (full ringtone) at 0.0s
renderCoinDropChat(buffer, 0.0);

// 2. Listing coin drop at 0.9s
renderCoinDropListing(buffer, 0.9);

// 3. Soft ding (chat-open) at 1.7s
renderDing(buffer, 1.7);

// Normalize to prevent clipping (peak should be <= 1.0)
let peak = 0;
for (let i = 0; i < buffer.length; i++) {
  const abs = Math.abs(buffer[i]);
  if (abs > peak) peak = abs;
}
if (peak > 1.0) {
  const scale = 0.95 / peak;
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] *= scale;
  }
}

// Write to public/sounds/preview-coin-drop.wav
const outputDir = require("path").join(process.cwd(), "public", "sounds");
require("fs").mkdirSync(outputDir, { recursive: true });
const outputFile = require("path").join(outputDir, "preview-coin-drop.wav");
writeWav(outputFile, buffer, SAMPLE_RATE);

console.log("✓ Preview WAV generated: " + outputFile);
console.log("  Duration: " + TOTAL_DURATION_SEC + "s");
console.log("  Sample rate: " + SAMPLE_RATE + " Hz");
console.log("  Peak amplitude: " + peak.toFixed(3));
console.log("");
console.log("Contents:");
console.log("  0.0s — Chat coin drop (4 clinks, bright) — playNotificationSound()");
console.log("  0.9s — Listing coin drop (3 clinks, lower) — playListingNotificationSound()");
console.log("  1.7s — Soft ding (1 clink, quiet) — playDingSound() [chat is open]");
