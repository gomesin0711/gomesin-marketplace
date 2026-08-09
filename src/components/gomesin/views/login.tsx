"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, translations as i18nTranslations, formatT } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";

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

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName.trim() || !rEmail.trim() || !rPass) {
      toast.error(tr("errRequired"));
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
          <img src="/logo.jpeg" alt="Gomesin" className="size-16 rounded-2xl shadow-lg object-cover" />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
            <span className="text-primary">go</span>mesin
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
            rName={rName} setRName={setRName}
            rEmail={rEmail} setREmail={setREmail}
            rPhone={rPhone} setRPhone={setRPhone}
            rPass={rPass} setRPass={setRPass}
            rPass2={rPass2} setRPass2={setRPass2}
            agree={agree} setAgree={setAgree}
            doLogin={doLogin} doRegister={doRegister}
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
              alt="Gomesin"
              className="size-24 rounded-3xl shadow-2xl object-cover ring-4 ring-white/20"
            />
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-primary-foreground">
              <span className="text-white">go</span>mesin
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
              <img src="/logo.jpeg" alt="Gomesin" className="size-10 rounded-xl object-cover shadow-sm" />
              <h1 className="text-xl font-extrabold tracking-tight">
                <span className="text-primary">go</span>mesin
              </h1>
            </div>
            <FormSection
              tab={tab} setTab={setTab}
              showPass={showPass} setShowPass={setShowPass}
              loading={loading}
              lEmail={lEmail} setLEmail={setLEmail}
              lPass={lPass} setLPass={setLPass}
              rName={rName} setRName={setRName}
              rEmail={rEmail} setREmail={setREmail}
              rPhone={rPhone} setRPhone={setRPhone}
              rPass={rPass} setRPass={setRPass}
              rPass2={rPass2} setRPass2={setRPass2}
              agree={agree} setAgree={setAgree}
              doLogin={doLogin} doRegister={doRegister}
              tr={tr}
            />
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className={cn("size-3.5 text-primary")} />
              {tr("dataSecure")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Reusable form section (used in both mobile & desktop) ===== */
function FormSection({
  tab, setTab, showPass, setShowPass, loading,
  lEmail, setLEmail, lPass, setLPass,
  rName, setRName, rEmail, setREmail, rPhone, setRPhone,
  rPass, setRPass, rPass2, setRPass2, agree, setAgree,
  doLogin, doRegister, tr,
}: {
  tab: string; setTab: (v: "login" | "register") => void;
  showPass: boolean; setShowPass: (v: boolean | ((p: boolean) => boolean)) => void;
  loading: boolean;
  lEmail: string; setLEmail: (v: string) => void;
  lPass: string; setLPass: (v: string) => void;
  rName: string; setRName: (v: string) => void;
  rEmail: string; setREmail: (v: string) => void;
  rPhone: string; setRPhone: (v: string) => void;
  rPass: string; setRPass: (v: string) => void;
  rPass2: string; setRPass2: (v: string) => void;
  agree: boolean; setAgree: (v: boolean) => void;
  doLogin: (e: React.FormEvent) => void;
  doRegister: (e: React.FormEvent) => void;
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
            <button type="button" onClick={() => toast.info(tr("forgotPasswordSoon"))} className="font-medium text-primary hover:underline">
              {tr("forgotPassword")}
            </button>
          </div>
          <Button type="submit" disabled={loading} className="w-full gap-2 bg-primary font-semibold" size="lg">
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
              <Input id="r-name" value={rName} onChange={(e) => setRName(e.target.value)} placeholder={tr("fullNamePlaceholder")} className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-email">{`${tr("email")} *`}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="r-email" type="email" autoComplete="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} placeholder="nama@email.com" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-phone">{tr("whatsapp")}</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="r-phone" value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder={tr("whatsappPlaceholder")} className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-pass">{`${tr("password")} *`}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="r-pass" type={showPass ? "text" : "password"} autoComplete="new-password" value={rPass} onChange={(e) => setRPass(e.target.value)} placeholder={tr("passwordPlaceholder")} className="px-9" />
              <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPass ? tr("hidePass") : tr("showPass")}>
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-pass2">{`${tr("passwordConfirm")} *`}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="r-pass2" type={showPass ? "text" : "password"} autoComplete="new-password" value={rPass2} onChange={(e) => setRPass2(e.target.value)} placeholder={tr("passwordConfirmPlaceholder")} className="pl-9" />
            </div>
            {rPass2 && rPass !== rPass2 && (
              <p className="text-xs text-destructive">{tr("passwordMismatch")}</p>
            )}
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-primary" />
            <span>{tr("agreeTerms")}</span>
          </label>
          <Button type="submit" disabled={loading} className="w-full gap-2 bg-primary font-semibold" size="lg">
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
