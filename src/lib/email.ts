/**
 * Kirim email OTP menggunakan Resend.
 *
 * Butuh env var:
 *   RESEND_API_KEY  — API key dari https://resend.com (gratis 100 email/hari)
 */

import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend | null {
  if (resendInstance) return resendInstance;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  resendInstance = new Resend(apiKey);
  return resendInstance;
}

export async function sendOtpEmail(
  to: string,
  otpCode: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();
    if (!resend) {
      return { success: false, error: "RESEND_API_KEY belum dikonfigurasi." };
    }

    const { error } = await resend.emails.send({
      from: "GoMesin <noreply@resend.dev>",
      to: [to],
      subject: "GoMesin - Kode Verifikasi",
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;">
          <h2 style="color:#222;margin:0 0 8px;">GoMesin - Kode Verifikasi</h2>
          <p style="color:#555;margin:0 0 20px;">Kode OTP Anda:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#222;text-align:center;padding:16px 0;border:2px dashed #ddd;border-radius:8px;">
            ${otpCode}
          </div>
          <p style="color:#999;font-size:13px;margin:20px 0 0;">Jangan berikan kode ini. Kode berlaku 1 menit.</p>
        </div>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Email send error:", err?.message || err);
    return { success: false, error: "Gagal mengirim email." };
  }
}
