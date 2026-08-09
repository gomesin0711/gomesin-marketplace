import { NextRequest, NextResponse } from "next/server";

// Self-contained animated sticker pack (no external API dependency)
// Each sticker = emoji + CSS animation type. Client renders them as big animated emoji stickers.
export type StickerItem = {
  id: string;
  emoji: string;
  label: string;
  animation: "bounce" | "pulse" | "wiggle" | "spin" | "tada" | "shake" | "heartbeat" | "float";
};

const TRENDING: StickerItem[] = [
  { id: "s1", emoji: "👍", label: "Thumbs Up", animation: "bounce" },
  { id: "s2", emoji: "❤️", label: "Love", animation: "heartbeat" },
  { id: "s3", emoji: "😂", label: "LOL", animation: "shake" },
  { id: "s4", emoji: "🎉", label: "Party", animation: "tada" },
  { id: "s5", emoji: "🔥", label: "Fire", animation: "pulse" },
  { id: "s6", emoji: "👏", label: "Applause", animation: "bounce" },
  { id: "s7", emoji: "✨", label: "Sparkle", animation: "spin" },
  { id: "s8", emoji: "💯", label: "100", animation: "pulse" },
  { id: "s9", emoji: "🤩", label: "Starstruck", animation: "wiggle" },
  { id: "s10", emoji: "🙌", label: "Raise Hands", animation: "float" },
  { id: "s11", emoji: "😎", label: "Cool", animation: "wiggle" },
  { id: "s12", emoji: "🙏", label: "Thanks", animation: "pulse" },
  { id: "s13", emoji: "💪", label: "Strong", animation: "pulse" },
  { id: "s14", emoji: "🤝", label: "Deal", animation: "bounce" },
  { id: "s15", emoji: "😊", label: "Smile", animation: "float" },
  { id: "s16", emoji: "😄", label: "Happy", animation: "bounce" },
  { id: "s17", emoji: "🥳", label: "Celebrate", animation: "tada" },
  { id: "s18", emoji: "👋", label: "Hello", animation: "wiggle" },
  { id: "s19", emoji: "✅", label: "OK", animation: "pulse" },
  { id: "s20", emoji: "⭐", label: "Star", animation: "spin" },
  { id: "s21", emoji: "💥", label: "Boom", animation: "tada" },
  { id: "s22", emoji: "🚀", label: "Rocket", animation: "float" },
  { id: "s23", emoji: "💰", label: "Money", animation: "pulse" },
  { id: "s24", emoji: "🏆", label: "Trophy", animation: "bounce" },
];

// Mood-based sets
const MOODS: Record<string, StickerItem[]> = {
  senang: [
    { id: "h1", emoji: "😄", label: "Happy", animation: "bounce" },
    { id: "h2", emoji: "😂", label: "LOL", animation: "shake" },
    { id: "h3", emoji: "🤩", label: "Starstruck", animation: "wiggle" },
    { id: "h4", emoji: "🎉", label: "Party", animation: "tada" },
    { id: "h5", emoji: "😎", label: "Cool", animation: "wiggle" },
    { id: "h6", emoji: "🥳", label: "Celebrate", animation: "tada" },
    { id: "h7", emoji: "👏", label: "Applause", animation: "bounce" },
    { id: "h8", emoji: "💯", label: "100", animation: "pulse" },
  ],
  sedih: [
    { id: "sd1", emoji: "😢", label: "Sad", animation: "float" },
    { id: "sd2", emoji: "😭", label: "Crying", animation: "shake" },
    { id: "sd3", emoji: "😔", label: "Pensive", animation: "float" },
    { id: "sd4", emoji: "💔", label: "Broken Heart", animation: "heartbeat" },
  ],
  halo: [
    { id: "hl1", emoji: "👋", label: "Hello", animation: "wiggle" },
    { id: "hl2", emoji: "🙏", label: "Namaste", animation: "pulse" },
    { id: "hl3", emoji: "🤝", label: "Handshake", animation: "bounce" },
    { id: "hl4", emoji: "😊", label: "Smile", animation: "float" },
  ],
  terima: [
    { id: "tr1", emoji: "🙏", label: "Thanks", animation: "pulse" },
    { id: "tr2", emoji: "👍", label: "Thumbs Up", animation: "bounce" },
    { id: "tr3", emoji: "💯", label: "100", animation: "pulse" },
    { id: "tr4", emoji: "🤝", label: "Deal", animation: "bounce" },
  ],
  cinta: [
    { id: "ct1", emoji: "❤️", label: "Love", animation: "heartbeat" },
    { id: "ct2", emoji: "💕", label: "Hearts", animation: "heartbeat" },
    { id: "ct3", emoji: "😍", label: "Heart Eyes", animation: "float" },
    { id: "ct4", emoji: "💖", label: "Sparkle Heart", animation: "pulse" },
  ],
};

function matchCategory(q: string): StickerItem[] | null {
  const lower = q.toLowerCase();
  if (/(senang|gembira|happy|lol|haha|tertawa|bahagia|yes|keren|cool|mantap|great|good|party|pesta)/.test(lower)) return MOODS.senang;
  if (/(sedih|sad|nangis|cry|menangis|duka)/.test(lower)) return MOODS.sedih;
  if (/(halo|hai|hello|hi|pagi|selamat|sapa)/.test(lower)) return MOODS.halo;
  if (/(terima|makasih|thanks|thank)/.test(lower)) return MOODS.terima;
  if (/(cinta|love|sayang|kiss)/.test(lower)) return MOODS.cinta;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    if (q) {
      const matched = matchCategory(q);
      return NextResponse.json({
        stickers: matched || TRENDING,
        source: matched ? "matched" : "trending",
      });
    }
    return NextResponse.json({ stickers: TRENDING, source: "trending" });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gagal: " + (e?.message || "unknown"), stickers: [], source: "error" },
      { status: 500 }
    );
  }
}
