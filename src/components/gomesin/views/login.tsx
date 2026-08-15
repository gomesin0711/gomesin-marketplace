"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Cog,
  ChevronLeft,
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, translations as i18nTranslations, formatT } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { ForgotPasswordDialog } from "@/components/gomesin/forgot-password-dialog";

export function LoginView() {
  const goBack = useStore((s) => s.goBack);

  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [lEmail, setLEmail] = useState("");
  const [lPass, setLPass] = useState("");

  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rPass, setRPass] = useState("");
  const [rPass2, setRPass2] = useState("");
  const [agree, setAgree] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [forgotOpen, setForgotOpen] = useState(false);

  // --- Register OTP state ---
  const [rOtp, setROtp] = useState("");
  const [rOtpSending, setROtpSending] = useState(false);
  const [rOtpVerifying, setROtpVerifying] = useState(false);
  const [rOtpVerified, setROtpVerified] = useState(false);
  const [rOtpDevCode, setROtpDevCode] = useState<string | null>(null);
  const [rOtpCooldown, setROtpCooldown] = useState(0);

  // --- Register email availability check ---
  // Status: "idle" | "checking" | "available" | "taken" | "invalid"
  const [rEmailStatus, setREmailStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // --- Register name & phone availability checks ---
  const [rNameStatus, setRNameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [rPhoneStatus, setRPhoneStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  useEffect(() => {
    if (rOtpCooldown <= 0) return;
    const id = setTimeout(() => setROtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [rOtpCooldown]);

  // Debounced email availability check — fires 500ms after the user stops typing.
  // Only checks well-formed emails to avoid pointless API calls.
  useEffect(() => {
    const email = rEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setREmailStatus("idle");
      return;
    }
    if (!emailRegex.test(email)) {
      setREmailStatus("invalid");
      return;
    }
    setREmailStatus("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (cancelled) return;
        setREmailStatus(data?.exists ? "taken" : "available");
      } catch {
        if (!cancelled) setREmailStatus("idle");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rEmail]);

  // Debounced NAME availability check — fires 500ms after the user stops typing.
  // Blocks registration if the name is already taken (case-insensitive).
  useEffect(() => {
    const name = rName.trim();
    if (name.length < 2) {
      setRNameStatus("idle");
      return;
    }
    setRNameStatus("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-availability?name=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (cancelled) return;
        setRNameStatus(data?.nameTaken ? "taken" : "available");
      } catch {
        if (!cancelled) setRNameStatus("idle");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rName]);

  // Debounced PHONE (WhatsApp) availability check — fires 500ms after the user
  // stops typing. Only checks once the number has at least 9 digits.
  useEffect(() => {
    const phone = rPhone.trim();
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 9) {
      setRPhoneStatus("idle");
      return;
    }
    setRPhoneStatus("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-availability?phone=${encodeURIComponent(phone)}`);
        const data = await res.json();
        if (cancelled) return;
        setRPhoneStatus(data?.phoneTaken ? "taken" : "available");
      } catch {
        if (!cancelled) setRPhoneStatus("idle");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rPhone]);

  // --- Login method toggle (Email vs No. WhatsApp) ---
  const [loginMethod, setLoginMethod] = useState<"email" | "wa">("email");

  // --- WhatsApp login OTP state (login tab) ---
  const [lWaPhone, setLWaPhone] = useState("");
  const [lWaOtp, setLWaOtp] = useState("");
  const [lWaOtpSending, setLWaOtpSending] = useState(false);
  const [lWaOtpVerifying, setLWaOtpVerifying] = useState(false);
  const [lWaOtpVerified, setLWaOtpVerified] = useState(false);
  const [lWaOtpDevCode, setLWaOtpDevCode] = useState<string | null>(null);
  const [lWaCooldown, setLWaCooldown] = useState(0);

  useEffect(() => {
    if (lWaCooldown <= 0) return;
    const id = setTimeout(() => setLWaCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [lWaCooldown]);

  // When phone changes after verification, reset verified state so user must re-verify.
  const prevLWaPhoneRef = useRef<string>("");
  useEffect(() => {
    if (prevLWaPhoneRef.current !== lWaPhone) {
      prevLWaPhoneRef.current = lWaPhone;
      if (lWaOtpVerified) setLWaOtpVerified(false);
    }
  }, [lWaPhone, lWaOtpVerified]);

  const sendLoginOtp = async () => {
    if (!lWaPhone.trim()) {
      toast.error(tr("errPhoneRequired"));
      return;
    }
    setLWaOtpSending(true);
    setLWaOtpDevCode(null);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: lWaPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If the number is not registered, show a specific helpful error.
        const isNotFound = /tidak ditemukan|not found|not registered|tidak terdaftar/i.test(
          data.error || ""
        );
        toast.error(isNotFound ? tr("loginWaNotFound") : (data.error || tr("errConnection")));
        return;
      }
      toast.success(data.message || tr("loginWaOtpSentEmail"));
      if (data._devCode) {
        setLWaOtpDevCode(data._devCode);
      }
      setLWaCooldown(60);
    } catch {
      toast.error(tr("errConnection"));
    } finally {
      setLWaOtpSending(false);
    }
  };

  const verifyLoginOtp = async () => {
    if (lWaOtp.length < 6) {
      toast.error(tr("regOtpRequired"));
      return;
    }
    setLWaOtpVerifying(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone: lWaPhone, code: lWaOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr("regOtpInvalid"));
        return;
      }
      toast.success(tr("loginWaVerified"));
      setLWaOtpVerified(true);
    } catch {
      toast.error(tr("errConnection"));
    } finally {
      setLWaOtpVerifying(false);
    }
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // ===== WhatsApp OTP login path =====
    if (loginMethod === "wa") {
      if (!lWaPhone.trim()) {
        toast.error(tr("errPhoneRequired"));
        return;
      }
      if (!lWaOtpVerified) {
        toast.error(tr("loginWaOtpFirst"));
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: lWaPhone }),
        });
        const data = await res.json();
        if (!res.ok) {
          const isNotFound = /tidak terdaftar|not registered|not found/i.test(data.error || "");
          toast.error(isNotFound ? tr("loginWaNotFound") : (data.error || tr("errLogin")));
          return;
        }
        const setUser = useStore.getState().setUser;
        const goHome = useStore.getState().goHome;
        const goToAdmin = useStore.getState().goToAdmin;
        setUser(data.user);
        setSuccess(true);
        toast.success(formatT(tr("welcomeBack"), { name: data.user.name }));
        const isAdmin = data.user.role === "admin" || data.user.role === "superadmin";
        setTimeout(() => isAdmin ? goToAdmin() : goHome(), 900);
      } catch {
        toast.error(tr("errConnection"));
      } finally {
        setLoading(false);
      }
      return;
    }

    // ===== Email + password login path (default) =====
    if (!lEmail.trim() || !lPass) {
      toast.error(tr("errEmailPass"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lEmail, password: lPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr("errLogin"));
        return;
      }
      const setUser = useStore.getState().setUser;
      const goHome = useStore.getState().goHome;
      const goToAdmin = useStore.getState().goToAdmin;
      setUser(data.user);
      setSuccess(true);
      toast.success(formatT(tr("welcomeBack"), { name: data.user.name }));
      const isAdmin = data.user.role === "admin" || data.user.role === "superadmin";
      setTimeout(() => isAdmin ? goToAdmin() : goHome(), 900);
    } catch {
      toast.error(tr("errConnection"));
    } finally {
      setLoading(false);
    }
  };

  const sendRegOtp = async () => {
    if (!rPhone.trim()) {
      toast.error(tr("regOtpPhoneFirst"));
      return;
    }
    if (rPhoneStatus === "taken") {
      toast.error(tr("errPhoneTaken"));
      return;
    }
    if (rPhoneStatus === "checking") {
      toast.error(tr("phoneChecking"));
      return;
    }
    setROtpSending(true);
    setROtpDevCode(null);
    try {
      const res = await fetch("/api/auth/register-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: rPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr("errConnection"));
        return;
      }
      toast.success(data.message || tr("regOtpSent"));
      if (data._devCode) {
        setROtpDevCode(data._devCode);
      }
      setROtpCooldown(60);
    } catch {
      toast.error(tr("errConnection"));
    } finally {
      setROtpSending(false);
    }
  };

  const verifyRegOtp = async () => {
    if (rOtp.length < 6) {
      toast.error(tr("regOtpRequired"));
      return;
    }
    setROtpVerifying(true);
    try {
      const res = await fetch("/api/auth/register-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone: rPhone, code: rOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr("regOtpInvalid"));
        return;
      }
      toast.success(tr("otpVerified"));
      setROtpVerified(true);
    } catch {
      toast.error(tr("errConnection"));
    } finally {
      setROtpVerifying(false);
    }
  };

  // When phone changes after verification, reset verified state so user must re-verify.
  const prevPhoneRef = useRef<string>("");
  useEffect(() => {
    if (prevPhoneRef.current !== rPhone) {
      prevPhoneRef.current = rPhone;
      if (rOtpVerified) setROtpVerified(false);
    }
  }, [rPhone, rOtpVerified]);

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName.trim() || !rEmail.trim() || !rPass) {
      toast.error(tr("errRequired"));
      return;
    }
    if (rEmailStatus === "invalid") {
      toast.error(tr("emailInvalid"));
      return;
    }
    if (rEmailStatus === "taken") {
      toast.error(tr("errEmailTaken"));
      return;
    }
    // If still checking, wait for it to resolve before allowing registration
    // so we never submit a duplicate even in a race.
    if (rEmailStatus === "checking") {
      toast.error(tr("emailChecking"));
      return;
    }
    if (rNameStatus === "taken") {
      toast.error(tr("errNameTaken"));
      return;
    }
    if (rNameStatus === "checking") {
      toast.error(tr("nameChecking"));
      return;
    }
    if (rPhoneStatus === "taken") {
      toast.error(tr("errPhoneTaken"));
      return;
    }
    if (rPhoneStatus === "checking") {
      toast.error(tr("phoneChecking"));
      return;
    }
    if (!rOtpVerified) {
      toast.error(tr("errPhoneNotVerified"));
      return;
    }
    if (rPass.length < 6) {
      toast.error(tr("errPassLength"));
      return;
    }
    if (rPass !== rPass2) {
      toast.error(tr("errPassMatch"));
      return;
    }
    if (!agree) {
      toast.error(tr("errAgree"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rName,
          email: rEmail,
          password: rPass,
          phone: rPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr("errRegister"));
        return;
      }
      const setUser = useStore.getState().setUser;
      const goToPost = useStore.getState().goToPost;
      const goToAdmin = useStore.getState().goToAdmin;
      setUser(data.user);
      setSuccess(true);
      toast.success(tr("registerSuccess"));
      const isAdmin = data.user.role === "admin" || data.user.role === "superadmin";
      setTimeout(() => isAdmin ? goToAdmin() : goToPost(), 1100);
    } catch {
      toast.error(tr("errConnection"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center animate-fade-up">
        <div className="grid size-20 place-items-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-12 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-bold">{tr("loginSuccess")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("loginRedirect")}
        </p>
        <Loader2 className="mt-4 size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {/* ===== MOBILE: compact single column ===== */}
      <div className="flex min-h-[calc(100vh-4rem)] flex-col px-4 py-6 md:hidden">
        <button
          onClick={goBack}
          className="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="size-4" /> {tr("back")}
        </button>
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="mesinKU" className="size-16 rounded-2xl shadow-lg object-cover" />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
            <span className="text-primary">mesin</span>KU
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr("loginTitle")}</p>
        </div>
        <div className="mt-6 w-full max-w-md mx-auto">
          <FormSection
            tab={tab} setTab={setTab}
            showPass={showPass} setShowPass={setShowPass}
            loading={loading}
            lEmail={lEmail} setLEmail={setLEmail}
            lPass={lPass} setLPass={setLPass}
            loginMethod={loginMethod} setLoginMethod={setLoginMethod}
            lWaPhone={lWaPhone} setLWaPhone={setLWaPhone}
            lWaOtp={lWaOtp} setLWaOtp={setLWaOtp}
            lWaOtpSending={lWaOtpSending}
            lWaOtpVerifying={lWaOtpVerifying}
            lWaOtpVerified={lWaOtpVerified}
            lWaOtpDevCode={lWaOtpDevCode}
            lWaCooldown={lWaCooldown}
            sendLoginOtp={sendLoginOtp}
            verifyLoginOtp={verifyLoginOtp}
            rName={rName} setRName={setRName}
            rNameStatus={rNameStatus}
            rEmail={rEmail} setREmail={setREmail}
            rEmailStatus={rEmailStatus}
            rPhone={rPhone} setRPhone={setRPhone}
            rPhoneStatus={rPhoneStatus}
            rPass={rPass} setRPass={setRPass}
            rPass2={rPass2} setRPass2={setRPass2}
            agree={agree} setAgree={setAgree}
            rOtp={rOtp} setROtp={setROtp}
            rOtpSending={rOtpSending}
            rOtpVerifying={rOtpVerifying}
            rOtpVerified={rOtpVerified}
            rOtpDevCode={rOtpDevCode}
            rOtpCooldown={rOtpCooldown}
            sendRegOtp={sendRegOtp}
            verifyRegOtp={verifyRegOtp}
            doLogin={doLogin} doRegister={doRegister}
            onForgotPassword={() => setForgotOpen(true)}
            tr={tr}
          />
        </div>
      </div>

      {/* ===== DESKTOP: 1/2 orange block + 1/2 centered form ===== */}
      <div className="hidden md:grid md:grid-cols-2 md:min-h-[calc(100vh-4rem)]">
        {/* LEFT: Orange block with logo + marketing text */}
        <div className="relative flex flex-col items-center justify-center bg-primary px-12 py-16 overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-24 -left-24 size-72 rounded-full bg-white/20" />
            <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-white/10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] rounded-full bg-white/5" />
          </div>
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpeg"
              alt="mesinKU"
              className="size-24 rounded-3xl shadow-2xl object-cover ring-4 ring-white/20"
            />
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-primary-foreground">
              <span className="text-white">mesin</span>KU
            </h1>
            <h2 className="mt-5 text-2xl font-black leading-tight text-white">
              Jual &amp; beli mesin industri, lebih cepat, lebih aman.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
              Ribuan listing MESIN CETAK, CNC, Laser, kompresor, alat berat &amp; sparepart — baru dan bekas dari seller terverifikasi se-Indonesia.
            </p>
            <p className="mt-2 text-lg font-black tracking-wider text-white">TANPA KOMISI !</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {[
                { icon: ShieldCheck, label: "Seller Terverifikasi" },
                { icon: MapPin, label: "Se-Indonesia" },
                { icon: Cog, label: "Mesin Berkualitas" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Centered login/register form */}
        <div className="flex flex-col items-center justify-center px-8 py-12">
          <div className="w-full max-w-md">
            <button
              onClick={goBack}
              className="mb-6 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
              <ChevronLeft className="size-4" /> {tr("back")}
            </button>
            <div className="mb-6 flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="mesinKU" className="size-10 rounded-xl object-cover shadow-sm" />
              <h1 className="text-xl font-extrabold tracking-tight">
                <span className="text-primary">mesin</span>KU
              </h1>
            </div>
            <FormSection
              tab={tab} setTab={setTab}
              showPass={showPass} setShowPass={setShowPass}
              loading={loading}
              lEmail={lEmail} setLEmail={setLEmail}
              lPass={lPass} setLPass={setLPass}
              loginMethod={loginMethod} setLoginMethod={setLoginMethod}
              lWaPhone={lWaPhone} setLWaPhone={setLWaPhone}
              lWaOtp={lWaOtp} setLWaOtp={setLWaOtp}
              lWaOtpSending={lWaOtpSending}
              lWaOtpVerifying={lWaOtpVerifying}
              lWaOtpVerified={lWaOtpVerified}
              lWaOtpDevCode={lWaOtpDevCode}
              lWaCooldown={lWaCooldown}
              sendLoginOtp={sendLoginOtp}
              verifyLoginOtp={verifyLoginOtp}
              rName={rName} setRName={setRName}
              rNameStatus={rNameStatus}
              rEmail={rEmail} setREmail={setREmail}
              rEmailStatus={rEmailStatus}
              rPhone={rPhone} setRPhone={setRPhone}
              rPhoneStatus={rPhoneStatus}
              rPass={rPass} setRPass={setRPass}
              rPass2={rPass2} setRPass2={setRPass2}
              agree={agree} setAgree={setAgree}
              rOtp={rOtp} setROtp={setROtp}
              rOtpSending={rOtpSending}
              rOtpVerifying={rOtpVerifying}
              rOtpVerified={rOtpVerified}
              rOtpDevCode={rOtpDevCode}
              rOtpCooldown={rOtpCooldown}
              sendRegOtp={sendRegOtp}
              verifyRegOtp={verifyRegOtp}
              doLogin={doLogin} doRegister={doRegister}
              onForgotPassword={() => setForgotOpen(true)}
              tr={tr}
            />
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className={cn("size-3.5 text-primary")} />
              {tr("dataSecure")}
            </div>
          </div>
        </div>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}

/* ===== Reusable form section (used in both mobile & desktop) ===== */
function FormSection({
  tab, setTab, showPass, setShowPass, loading,
  lEmail, setLEmail, lPass, setLPass,
  loginMethod, setLoginMethod,
  lWaPhone, setLWaPhone, lWaOtp, setLWaOtp,
  lWaOtpSending, lWaOtpVerifying, lWaOtpVerified, lWaOtpDevCode, lWaCooldown,
  sendLoginOtp, verifyLoginOtp,
  rName, setRName, rNameStatus, rEmail, setREmail, rEmailStatus, rPhone, setRPhone, rPhoneStatus,
  rPass, setRPass, rPass2, setRPass2, agree, setAgree,
  rOtp, setROtp, rOtpSending, rOtpVerifying, rOtpVerified, rOtpDevCode, rOtpCooldown,
  sendRegOtp, verifyRegOtp,
  doLogin, doRegister, onForgotPassword, tr,
}: {
  tab: string; setTab: (v: "login" | "register") => void;
  showPass: boolean; setShowPass: (v: boolean | ((p: boolean) => boolean)) => void;
  loading: boolean;
  lEmail: string; setLEmail: (v: string) => void;
  lPass: string; setLPass: (v: string) => void;
  loginMethod: "email" | "wa"; setLoginMethod: (v: "email" | "wa") => void;
  lWaPhone: string; setLWaPhone: (v: string) => void;
  lWaOtp: string; setLWaOtp: (v: string) => void;
  lWaOtpSending: boolean;
  lWaOtpVerifying: boolean;
  lWaOtpVerified: boolean;
  lWaOtpDevCode: string | null;
  lWaCooldown: number;
  sendLoginOtp: () => void;
  verifyLoginOtp: () => void;
  rName: string; setRName: (v: string) => void;
  rNameStatus: "idle" | "checking" | "available" | "taken";
  rEmail: string; setREmail: (v: string) => void;
  rEmailStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  rPhone: string; setRPhone: (v: string) => void;
  rPhoneStatus: "idle" | "checking" | "available" | "taken";
  rPass: string; setRPass: (v: string) => void;
  rPass2: string; setRPass2: (v: string) => void;
  agree: boolean; setAgree: (v: boolean) => void;
  rOtp: string; setROtp: (v: string) => void;
  rOtpSending: boolean;
  rOtpVerifying: boolean;
  rOtpVerified: boolean;
  rOtpDevCode: string | null;
  rOtpCooldown: number;
  sendRegOtp: () => void;
  verifyRegOtp: () => void;
  doLogin: (e: React.FormEvent) => void;
  doRegister: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
  tr: (key: any) => any;
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="login">{tr("tabLogin")}</TabsTrigger>
        <TabsTrigger value="register">{tr("tabRegister")}</TabsTrigger>
      </TabsList>

      <TabsContent value="login">
        <form onSubmit={doLogin} className="space-y-4 rounded-xl border border-border bg-card p-5">
          {/* ===== Login method toggle: Email / No. WhatsApp ===== */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setLoginMethod("email")}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                loginMethod === "email"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Mail className="size-4" />
              {tr("loginMethodEmail")}
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod("wa")}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                loginMethod === "wa"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Phone className="size-4" />
              {tr("loginMethodWa")}
            </button>
          </div>

          {/* ===== Email + password fields ===== */}
          {loginMethod === "email" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="l-email">{tr("email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="l-email" type="email" autoComplete="email" value={lEmail} onChange={(e) => setLEmail(e.target.value)} placeholder="nama@email.com" className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-pass">{tr("password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="l-pass" type={showPass ? "text" : "password"} autoComplete="current-password" value={lPass} onChange={(e) => setLPass(e.target.value)} placeholder="••••••••" className="px-9" />
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPass ? tr("hidePass") : tr("showPass")}>
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <input type="checkbox" className="accent-primary" /> {tr("rememberMe")}
                </label>
                <button type="button" onClick={onForgotPassword} className="font-medium text-primary hover:underline">
                  {tr("forgotPassword")}
                </button>
              </div>
            </>
          )}

          {/* ===== WhatsApp number + OTP fields ===== */}
          {loginMethod === "wa" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="l-wa-phone">{tr("loginWaNumberLabel")}</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="l-wa-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={lWaPhone}
                    onChange={(e) => setLWaPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="pl-9"
                    disabled={lWaOtpVerified}
                  />
                </div>
              </div>

              {/* ===== Login OTP step ===== */}
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="l-wa-otp" className="text-xs font-medium">
                    {tr("loginWaOtpLabel")}
                  </Label>
                  {lWaOtpVerified && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                      <CheckCircle2 className="size-3.5" /> {tr("regOtpVerified")}
                    </span>
                  )}
                </div>

                {/* OTP input + verify button */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <InputOTP
                    maxLength={6}
                    value={lWaOtp}
                    onChange={(v) => setLWaOtp(v)}
                    disabled={lWaOtpVerified}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="size-9 text-sm" />
                      <InputOTPSlot index={1} className="size-9 text-sm" />
                      <InputOTPSlot index={2} className="size-9 text-sm" />
                      <InputOTPSlot index={3} className="size-9 text-sm" />
                      <InputOTPSlot index={4} className="size-9 text-sm" />
                      <InputOTPSlot index={5} className="size-9 text-sm" />
                    </InputOTPGroup>
                  </InputOTP>

                  {!lWaOtpVerified && (
                    <Button
                      type="button"
                      onClick={verifyLoginOtp}
                      disabled={lWaOtpVerifying || lWaOtp.length < 6}
                      size="sm"
                      className="gap-1.5 bg-primary font-semibold sm:ml-auto"
                    >
                      {lWaOtpVerifying ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                      {lWaOtpVerifying ? tr("regOtpVerifying") : tr("regOtpVerify")}
                    </Button>
                  )}
                </div>

                {/* Dev-mode code box (OTP sent to email — shown here in dev) */}
                {lWaOtpDevCode && !lWaOtpVerified && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-center dark:border-amber-700 dark:bg-amber-950/40">
                    <p className="text-[10px] text-amber-700 dark:text-amber-300">
                      {tr("loginWaOtpSentEmail")} {tr("regOtpDevCode")}
                    </p>
                    <p className="mt-0.5 text-xl font-black tracking-widest text-amber-900 dark:text-amber-100">
                      {lWaOtpDevCode}
                    </p>
                  </div>
                )}

                {/* Send / resend button + cooldown */}
                {!lWaOtpVerified && (
                  <div className="flex items-center justify-between text-xs">
                    {lWaCooldown > 0 ? (
                      <span className="text-muted-foreground">
                        {formatT(tr("regOtpResendIn"), { sec: String(lWaCooldown) })}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={sendLoginOtp}
                        disabled={lWaOtpSending}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        {lWaOtpSending ? <Loader2 className="size-3 animate-spin" /> : <KeyRound className="size-3" />}
                        {lWaOtpSending ? tr("regOtpSending") : tr("regOtpSend")}
                      </button>
                    )}
                  </div>
                )}

                {!lWaOtpVerified && (
                  <p className="text-[10px] text-muted-foreground">
                    {tr("loginWaOtpFirst")}
                  </p>
                )}
              </div>
            </>
          )}

          <Button type="submit" disabled={loading || (loginMethod === "wa" && !lWaOtpVerified)} className="w-full gap-2 bg-primary font-semibold" size="lg">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? tr("processing") : tr("tabLogin")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {tr("noAccount")}{" "}
            <button type="button" onClick={() => setTab("register")} className="font-semibold text-primary hover:underline">
              {tr("registerNow")}
            </button>
          </p>
        </form>
      </TabsContent>

      <TabsContent value="register">
        <form onSubmit={doRegister} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">{`${tr("fullName")} *`}</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="r-name"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder={tr("fullNamePlaceholder")}
                className={cn(
                  "pl-9",
                  rNameStatus === "available" && "pr-9 border-green-500 focus-visible:ring-green-500/30",
                  rNameStatus === "taken" && "pr-9 border-destructive focus-visible:ring-destructive/30",
                )}
                aria-invalid={rNameStatus === "taken"}
              />
              {rNameStatus === "checking" && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {rNameStatus === "available" && (
                <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-green-600 dark:text-green-400" />
              )}
              {rNameStatus === "taken" && (
                <XCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-destructive" />
              )}
            </div>
            {rNameStatus === "checking" && (
              <p className="text-xs text-muted-foreground">{tr("nameChecking")}</p>
            )}
            {rNameStatus === "available" && (
              <p className="text-xs font-medium text-green-600 dark:text-green-400">{tr("nameAvailable")}</p>
            )}
            {rNameStatus === "taken" && (
              <p className="text-xs font-medium text-destructive">{tr("nameTaken")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-email">{`${tr("email")} *`}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="r-email"
                type="email"
                autoComplete="email"
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
                placeholder="nama@email.com"
                className={cn(
                  "pl-9",
                  rEmailStatus === "available" && "pr-9 border-green-500 focus-visible:ring-green-500/30",
                  rEmailStatus === "taken" && "pr-9 border-destructive focus-visible:ring-destructive/30",
                  rEmailStatus === "invalid" && "pr-9 border-destructive focus-visible:ring-destructive/30",
                )}
                aria-invalid={rEmailStatus === "taken" || rEmailStatus === "invalid"}
              />
              {rEmailStatus === "checking" && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {rEmailStatus === "available" && (
                <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-green-600 dark:text-green-400" />
              )}
              {rEmailStatus === "taken" && (
                <XCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-destructive" />
              )}
              {rEmailStatus === "invalid" && (
                <XCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-destructive" />
              )}
            </div>
            {rEmailStatus === "checking" && (
              <p className="text-xs text-muted-foreground">{tr("emailChecking")}</p>
            )}
            {rEmailStatus === "available" && (
              <p className="text-xs font-medium text-green-600 dark:text-green-400">{tr("emailAvailable")}</p>
            )}
            {rEmailStatus === "taken" && (
              <p className="text-xs font-medium text-destructive">{tr("emailTaken")}</p>
            )}
            {rEmailStatus === "invalid" && (
              <p className="text-xs font-medium text-destructive">{tr("emailInvalid")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-phone">{tr("whatsapp")}</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="r-phone"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
                placeholder={tr("whatsappPlaceholder")}
                className={cn(
                  "pl-9",
                  rPhoneStatus === "available" && "pr-9 border-green-500 focus-visible:ring-green-500/30",
                  rPhoneStatus === "taken" && "pr-9 border-destructive focus-visible:ring-destructive/30",
                )}
                aria-invalid={rPhoneStatus === "taken"}
              />
              {rPhoneStatus === "checking" && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {rPhoneStatus === "available" && (
                <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-green-600 dark:text-green-400" />
              )}
              {rPhoneStatus === "taken" && (
                <XCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-destructive" />
              )}
            </div>
            {rPhoneStatus === "checking" && (
              <p className="text-xs text-muted-foreground">{tr("phoneChecking")}</p>
            )}
            {rPhoneStatus === "available" && (
              <p className="text-xs font-medium text-green-600 dark:text-green-400">{tr("phoneAvailable")}</p>
            )}
            {rPhoneStatus === "taken" && (
              <p className="text-xs font-medium text-destructive">{tr("phoneTaken")}</p>
            )}
          </div>

          {/* ===== Register OTP step ===== */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="r-otp" className="text-xs font-medium">
                {tr("regOtpLabel")}
              </Label>
              {rOtpVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                  <CheckCircle2 className="size-3.5" /> {tr("regOtpVerified")}
                </span>
              )}
            </div>

            {/* OTP input + verify button */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <InputOTP
                maxLength={6}
                value={rOtp}
                onChange={(v) => setROtp(v)}
                disabled={rOtpVerified}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="size-9 text-sm" />
                  <InputOTPSlot index={1} className="size-9 text-sm" />
                  <InputOTPSlot index={2} className="size-9 text-sm" />
                  <InputOTPSlot index={3} className="size-9 text-sm" />
                  <InputOTPSlot index={4} className="size-9 text-sm" />
                  <InputOTPSlot index={5} className="size-9 text-sm" />
                </InputOTPGroup>
              </InputOTP>

              {!rOtpVerified && (
                <Button
                  type="button"
                  onClick={verifyRegOtp}
                  disabled={rOtpVerifying || rOtp.length < 6}
                  size="sm"
                  className="gap-1.5 bg-primary font-semibold sm:ml-auto"
                >
                  {rOtpVerifying ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  {rOtpVerifying ? tr("regOtpVerifying") : tr("regOtpVerify")}
                </Button>
              )}
            </div>

            {/* Dev-mode code box */}
            {rOtpDevCode && !rOtpVerified && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-center dark:border-amber-700 dark:bg-amber-950/40">
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  {tr("regOtpDevCode")}
                </p>
                <p className="mt-0.5 text-xl font-black tracking-widest text-amber-900 dark:text-amber-100">
                  {rOtpDevCode}
                </p>
              </div>
            )}

            {/* Send / resend button + cooldown */}
            {!rOtpVerified && (
              <div className="flex items-center justify-between text-xs">
                {rOtpCooldown > 0 ? (
                  <span className="text-muted-foreground">
                    {formatT(tr("regOtpResendIn"), { sec: String(rOtpCooldown) })}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={sendRegOtp}
                    disabled={rOtpSending || rPhoneStatus === "taken" || rPhoneStatus === "checking"}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {rOtpSending ? <Loader2 className="size-3 animate-spin" /> : <KeyRound className="size-3" />}
                    {rOtpSending ? tr("regOtpSending") : tr("regOtpSend")}
                  </button>
                )}
              </div>
            )}

            {!rOtpVerified && (
              <p className="text-[10px] text-muted-foreground">
                {tr("regOtpSendFirst")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-pass">{`${tr("password")} *`}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="r-pass" type={showPass ? "text" : "password"} autoComplete="new-password" value={rPass} onChange={(e) => setRPass(e.target.value)} placeholder={rOtpVerified ? tr("passwordPlaceholder") : tr("regOtpLocked")} className="px-9" disabled={!rOtpVerified} />
              <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPass ? tr("hidePass") : tr("showPass")} disabled={!rOtpVerified}>
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-pass2">{`${tr("passwordConfirm")} *`}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="r-pass2" type={showPass ? "text" : "password"} autoComplete="new-password" value={rPass2} onChange={(e) => setRPass2(e.target.value)} placeholder={tr("passwordConfirmPlaceholder")} className="pl-9" disabled={!rOtpVerified} />
            </div>
            {rPass2 && rPass !== rPass2 && (
              <p className="text-xs text-destructive">{tr("passwordMismatch")}</p>
            )}
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-primary" />
            <span>{tr("agreeTerms")}</span>
          </label>
          <Button type="submit" disabled={loading || !rOtpVerified || rEmailStatus === "taken" || rEmailStatus === "invalid" || rEmailStatus === "checking" || rNameStatus === "taken" || rNameStatus === "checking" || rPhoneStatus === "taken" || rPhoneStatus === "checking"} className="w-full gap-2 bg-primary font-semibold" size="lg">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? tr("processing") : tr("registerBtn")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {tr("haveAccount")}{" "}
            <button type="button" onClick={() => setTab("login")} className="font-semibold text-primary hover:underline">
              {tr("loginHere")}
            </button>
          </p>
        </form>
      </TabsContent>
    </Tabs>
  );
}
