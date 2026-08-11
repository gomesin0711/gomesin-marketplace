"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  ChevronLeft,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useLang, translations as i18nTranslations, formatT } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

type Step = "phone" | "otp" | "reset" | "done";

export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Dev-mode OTP (shown when Fonnte key is not configured)
  const [devCode, setDevCode] = useState<string | null>(null);

  // Resend cooldown
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        // small delay so close animation doesn't show reset state
        setTimeout(() => {
          setStep("phone");
          setPhone("");
          setOtp("");
          setNewPass("");
          setNewPass2("");
          setDevCode(null);
          setCooldown(0);
        }, 200);
      }
      onOpenChange(v);
    },
    [onOpenChange]
  );

  /* ---------------- SEND OTP ---------------- */
  const sendOtp = async () => {
    if (!phone.trim()) {
      toast.error(tr("forgotPhoneRequired"));
      return;
    }
    setLoading(true);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr("forgotNoPhone"));
        return;
      }
      toast.success(data.message || tr("forgotOtpSentWa"));
      if (data._devCode) {
        setDevCode(data._devCode);
      }
      setStep("otp");
      setCooldown(60);
    } catch {
      toast.error("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- VERIFY OTP ---------------- */
  const verifyOtp = async () => {
    if (otp.length < 6) {
      toast.error(tr("forgotOtpRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Verifikasi gagal");
        return;
      }
      toast.success(tr("otpVerified"));
      setStep("reset");
    } catch {
      toast.error("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- RESET PASSWORD ---------------- */
  const resetPassword = async () => {
    if (!newPass) {
      toast.error(tr("forgotPassTooShort"));
      return;
    }
    if (newPass.length < 6) {
      toast.error(tr("forgotPassTooShort"));
      return;
    }
    if (newPass !== newPass2) {
      toast.error(tr("forgotPassMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", phone, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal mereset sandi");
        return;
      }
      toast.success(tr("forgotResetSuccess"));
      setStep("done");
    } catch {
      toast.error("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- STEP LABELS ---------------- */
  const stepLabel =
    step === "phone"
      ? tr("forgotStepPhone")
      : step === "otp"
        ? tr("forgotStepOtp")
        : step === "reset"
          ? tr("forgotStepReset")
          : tr("forgotStepReset");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-primary/10">
            {step === "done" ? (
              <CheckCircle2 className="size-6 text-primary" />
            ) : step === "otp" ? (
              <KeyRound className="size-6 text-primary" />
            ) : (
              <MessageCircle className="size-6 text-primary" />
            )}
          </div>
          <DialogTitle className="text-center">{tr("forgotTitle")}</DialogTitle>
          <DialogDescription className="text-center">
            {step === "done" ? tr("forgotResetSuccess") : tr("forgotDesc")}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-2 text-xs font-medium">
            <span className={cn("rounded-full px-2.5 py-1", step === "phone" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>1</span>
            <span className="text-muted-foreground">—</span>
            <span className={cn("rounded-full px-2.5 py-1", step === "otp" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</span>
            <span className="text-muted-foreground">—</span>
            <span className={cn("rounded-full px-2.5 py-1", step === "reset" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>3</span>
          </div>
        )}

        {/* ---------------- STEP: PHONE ---------------- */}
        {step === "phone" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fp-phone">{tr("forgotPhoneLabel")}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fp-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812-xxxx-xxxx"
                  className="pl-9"
                  onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {tr("forgotOtpSentWa")}
              </p>
            </div>
            <Button
              onClick={sendOtp}
              disabled={loading}
              className="w-full gap-2 bg-primary font-semibold"
              size="lg"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
              {loading ? tr("forgotSending") : tr("forgotSendOtp")}
            </Button>
          </div>
        )}

        {/* ---------------- STEP: OTP ---------------- */}
        {step === "otp" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-center block">{tr("forgotOtpLabel")}</Label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(v) => setOtp(v)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="size-10 text-base" />
                    <InputOTPSlot index={1} className="size-10 text-base" />
                    <InputOTPSlot index={2} className="size-10 text-base" />
                    <InputOTPSlot index={3} className="size-10 text-base" />
                    <InputOTPSlot index={4} className="size-10 text-base" />
                    <InputOTPSlot index={5} className="size-10 text-base" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            {devCode && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center dark:border-amber-700 dark:bg-amber-950/40">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {tr("forgotOtpSentDev")}
                </p>
                <p className="mt-1 text-2xl font-black tracking-widest text-amber-900 dark:text-amber-100">
                  {devCode}
                </p>
              </div>
            )}

            <Button
              onClick={verifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full gap-2 bg-primary font-semibold"
              size="lg"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {loading ? tr("forgotVerifying") : tr("forgotVerify")}
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" /> {tr("back")}
              </button>
              {cooldown > 0 ? (
                <span className="text-muted-foreground">
                  {formatT(tr("forgotResendIn"), { sec: String(cooldown) })}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading}
                  className="font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {tr("forgotResendOtp")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------------- STEP: RESET ---------------- */}
        {step === "reset" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fp-pass">{tr("forgotNewPass")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fp-pass"
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="••••••••"
                  className="px-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPass ? tr("hidePass") : tr("showPass")}
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-pass2">{tr("forgotNewPass2")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fp-pass2"
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                />
              </div>
              {newPass2 && newPass !== newPass2 && (
                <p className="text-xs text-destructive">{tr("forgotPassMismatch")}</p>
              )}
            </div>
            <Button
              onClick={resetPassword}
              disabled={loading || !newPass || newPass !== newPass2}
              className="w-full gap-2 bg-primary font-semibold"
              size="lg"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {loading ? tr("forgotResetting") : tr("forgotResetBtn")}
            </Button>
          </div>
        )}

        {/* ---------------- STEP: DONE ---------------- */}
        {step === "done" && (
          <div className="space-y-4">
            <Button
              onClick={() => handleOpenChange(false)}
              className="w-full gap-2 bg-primary font-semibold"
              size="lg"
            >
              {tr("forgotBackToLogin")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
