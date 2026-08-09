/**
 * WhatsApp — kirim gambar/teks langsung ke WhatsApp via Fonnte API.
 *
 * Fonnte adalah layanan gateway WhatsApp pihak ketiga (populer di Indonesia)
 * yang BISA mengirim GAMBAR sebagai image message (bukan link). Gambar dikirim
 * sebagai base64 → muncul sebagai gambar asli di chat penerima.
 *
 * Butuh env var:
 *   FONNTE_API_KEY  — API key dari https://fonnte.com (daftar gratis)
 *
 * Jika belum diset, fungsi return error → frontend fallback ke wa.me link.
 */

interface WhatsAppResult {
  success: boolean;
  error?: string;
}

const FONNTE_API_URL = "https://api.fonnte.com/send";

function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-()+]/g, "");
  if (p.startsWith("0")) p = "62" + p.substring(1);
  if (!p.startsWith("62")) p = "62" + p;
  return p;
}

/**
 * Kirim GAMBAR (JPG/PNG) langsung ke WhatsApp via Fonnte API.
 * Gambar dikirim sebagai base64 → muncul sebagai image message di chat penerima.
 *
 * @param targetPhone  Nomor tujuan (08xxx / 628xxx)
 * @param caption      Caption pesan di bawah gambar
 * @param imageBase64  Gambar dalam format base64 (data URL atau raw base64)
 * @param fileName     Nama file (mis. "bukti-pembayaran.jpg")
 */
export async function sendWhatsAppImage(
  targetPhone: string,
  caption: string,
  imageBase64: string,
  fileName: string
): Promise<WhatsAppResult> {
  try {
    const apiKey = process.env.FONNTE_API_KEY?.trim();

    if (!apiKey) {
      return {
        success: false,
        error: "FONNTE_API_KEY belum dikonfigurasi.",
      };
    }

    const normalizedPhone = normalizePhone(targetPhone);

    // Pastikan base64 punya data URL prefix.
    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    // Kirim image via Fonnte API.
    // `message` = caption, `image` = base64 image, `filename` = nama file.
    const response = await fetch(FONNTE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        target: normalizedPhone,
        message: caption,
        media: imageDataUrl,
        mediatype: "image",
        filename: fileName,
      }),
    });

    const data = await response.json();

    // Fonnte return { status: true } on success.
    // Fonnte return { status: true } on success. HTTP 200 TIDAK menjamin sukses —
    // Fonnte bisa return 200 + status:false (mis. device disconnected).
    // Hanya cek data.status, BUKAN response.ok.
    if (data.status === true || data.status === "true") {
      return { success: true };
    }

    return {
      success: false,
      error: data.reason || data.message || data.error || "Gagal mengirim gambar (Fonnte)",
    };
  } catch (error: any) {
    console.error("WhatsApp send image error:", error?.message || error);
    return {
      success: false,
      error: "Gagal mengirim gambar. Periksa koneksi internet.",
    };
  }
}

/**
 * Kirim pesan TEKS ke WhatsApp via Fonnte API.
 */
export async function sendWhatsAppMessage(
  targetPhone: string,
  message: string
): Promise<WhatsAppResult> {
  try {
    const apiKey = process.env.FONNTE_API_KEY?.trim();

    if (!apiKey) {
      return { success: false, error: "FONNTE_API_KEY belum dikonfigurasi." };
    }

    const normalizedPhone = normalizePhone(targetPhone);

    const response = await fetch(FONNTE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        target: normalizedPhone,
        message: message,
      }),
    });

    const data = await response.json();

    if (data.status === true || data.status === "true") {
      return { success: true };
    }

    return {
      success: false,
      error: data.reason || data.message || data.error || "Gagal mengirim pesan (Fonnte)",
    };
  } catch (error: any) {
    console.error("WhatsApp send error:", error?.message || error);
    return { success: false, error: "Gagal mengirim pesan." };
  }
}
