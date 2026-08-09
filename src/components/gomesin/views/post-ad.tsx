"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVINCES, PROVINCE_CITIES, formatRupiahFull } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "../category-icon";
import { useLang, translations as i18nTranslations, categoryName } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import {
  Plus,
  X,
  ImagePlus,
  Loader2,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Tag,
  Upload,
  Camera,
  FileImage,
  Save,
  Crown,
  Zap,
  TrendingUp,
  Check,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import { shareImageToWhatsApp } from "@/lib/share-image";
import { useChatSocket } from "@/lib/use-chat-socket";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PLACEHOLDER_IMAGES = [
  "https://sfile.chatglm.cn/images-ppt/dae3b28e3c96.jpg",
  "https://sfile.chatglm.cn/images-ppt/c66b63ef4400.jpg",
  "https://sfile.chatglm.cn/images-ppt/9ef9dd58c181.jpg",
];

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("fail");
  return (await res.json()).categories as Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
  }>;
}

async function postListing(payload: any) {
  const res = await fetch("/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || tr("postFailed"));
  return data.listing;
}

// Year options: 2025 down to 1990
const YEAR_OPTIONS = Array.from({ length: 2025 - 1990 + 1 }, (_, i) => String(2025 - i));

const STEP_LABELS = ["Informasi Dasar", "Detail & Deskripsi", "Foto Mesin", "Konfirmasi"];

export function PostAdView() {
  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 0,
  });
  const { data: paketData } = useQuery({
    queryKey: ["admin-paket"],
    queryFn: async () => {
      const res = await fetch("/api/admin/paket");
      if (!res.ok) return null;
      return res.json() as Promise<{ pakets: any[] }>;
    },
    staleTime: 0,
  });
  const paketMap: Record<string, { price: number; originalPrice: number; duration: number; name: string; features: string[] }> = {};
  (paketData?.pakets || []).forEach((p: any) => {
    paketMap[p.key] = { price: p.price, originalPrice: p.originalPrice ?? 0, duration: p.duration, name: p.name, features: p.features };
  });

  const goToDetail = useStore((s) => s.goToDetail);
  const goHome = useStore((s) => s.goHome);
  const goToDashboard = useStore((s) => s.goToDashboard);
  const goToProfilePanel = useStore((s) => s.goToProfilePanel);
  const user = useStore((s) => s.user);
  const { sendMessage } = useChatSocket();

  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // Wizard step
  const [step, setStep] = useState(1);

  // Hydration flag — prevents the save effect from overwriting localStorage
  // with empty initial values before the load effect's setState applies.
  const [hydrated, setHydrated] = useState(false);

  // Draft form persistence key — data survives navigation/refresh.
  // Cleared only via Reset button or after successful post.
  const DRAFT_KEY = "gomesin-post-ad-draft";

  // Form state
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState("negotiable");
  const [condition, setCondition] = useState("bekas");
  const [availability, setAvailability] = useState("tersedia");
  const [adType, setAdType] = useState<"mesin" | "jasa">("mesin");
  const [brand, setBrand] = useState("");
  const [modelType, setModelType] = useState("");
  const [capacity, setCapacity] = useState("");
  const [yearProduced, setYearProduced] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [specs, setSpecs] = useState<{ k: string; v: string }[]>([
    { k: "", v: "" },
  ]);
  const [success, setSuccess] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState("colek");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [showPayment, setShowPayment] = useState(true);
  const [qrisModal, setQrisModal] = useState(false);
  const [qrisAmount, setQrisAmount] = useState(0);
  const [uniqueCode, setUniqueCode] = useState<number>(0);
  const [proofImage, setProofImage] = useState<string>("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // --- Persist form draft to localStorage (survives navigation/refresh) ---
  // Load on mount, save on change. Cleared on Reset or successful post.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.title) setTitle(d.title);
        if (d.categoryId) setCategoryId(d.categoryId);
        if (d.description) setDescription(d.description);
        if (d.price) setPrice(d.price);
        if (d.priceType) setPriceType(d.priceType);
        if (d.condition) setCondition(d.condition);
        if (d.availability) setAvailability(d.availability);
        if (d.adType) setAdType(d.adType);
        if (d.brand) setBrand(d.brand);
        if (d.modelType) setModelType(d.modelType);
        if (d.capacity) setCapacity(d.capacity);
        if (d.yearProduced) setYearProduced(d.yearProduced);
        if (d.city) setCity(d.city);
        if (d.province) setProvince(d.province);
        if (Array.isArray(d.images)) setImages(d.images);
        if (Array.isArray(d.specs) && d.specs.length) setSpecs(d.specs);
        if (d.selectedPackage) setSelectedPackage(d.selectedPackage);
        if (typeof d.step === "number" && d.step >= 1 && d.step <= 4) setStep(d.step);
      }
    } catch {}
    // Mark as hydrated so the save effect can start persisting.
    // This prevents the save effect from overwriting localStorage with
    // empty initial values before the loaded setState calls take effect.
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Don't save until after the initial load is complete — otherwise the
    // initial empty state would overwrite the saved draft on every mount.
    if (!hydrated) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          title,
          categoryId,
          description,
          price,
          priceType,
          condition,
          availability,
          adType,
          brand,
          modelType,
          capacity,
          yearProduced,
          city,
          province,
          images,
          specs,
          selectedPackage,
        })
      );
    } catch {}
  }, [hydrated, step, title, categoryId, description, price, priceType, condition, availability, adType, brand, modelType, capacity, yearProduced, city, province, images, specs, selectedPackage]);

  // --- Reset all form data ---
  const handleReset = () => {
    setStep(1);
    setTitle("");
    setCategoryId("");
    setDescription("");
    setPrice("");
    setPriceType("negotiable");
    setCondition("bekas");
    setAvailability("tersedia");
    setAdType("mesin");
    setBrand("");
    setModelType("");
    setCapacity("");
    setYearProduced("");
    setCity("");
    setProvince("");
    setImages([]);
    setSpecs([{ k: "", v: "" }]);
    setSelectedPackage("colek");
    setPaymentMethod("");
    setProofImage("");
    setQrisAmount(0);
    setUniqueCode(0);
    setQrisModal(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    toast.success("Form telah direset.");
  };

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // QRIS modal: lock body scroll
  useEffect(() => {
    if (qrisModal) {
      window.scrollTo({ top: 0, behavior: "instant" });
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [qrisModal]);

  // --- Fetch unique 3-digit code whenever selectedPackage changes ---
  // This ensures switching Gold → Platinum fetches a DIFFERENT unique code
  // (the API is idempotent per package, so switching back to Gold returns
  // the same Gold code again). The total = packagePrice + uniqueCode
  // updates reactively when the user picks a different package.
  useEffect(() => {
    if (!hydrated || !user?.id) return;
    const pk = paketMap[selectedPackage];
    const pkgPrice = pk?.price ?? 0;
    // Free / draft package — no unique code needed.
    if (pkgPrice <= 0 || selectedPackage === "simpan") {
      setUniqueCode(0);
      setQrisAmount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const codeRes = await fetch("/api/listings/unique-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            packageType: selectedPackage,
            amount: pkgPrice,
          }),
        });
        if (codeRes.ok && !cancelled) {
          const codeData = await codeRes.json();
          const uc = codeData.uniqueCode || 0;
          setUniqueCode(uc);
          setQrisAmount(pkgPrice + uc);
        } else if (!cancelled) {
          // API failed (e.g. ephemeral DB on Vercel) — fall back to package price.
          setUniqueCode(0);
          setQrisAmount(pkgPrice);
        }
      } catch {
        if (!cancelled) {
          setUniqueCode(0);
          setQrisAmount(pkgPrice);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPackage, hydrated, user?.id, paketData]);

  // --- Validation per step ---
  const validateStep = useCallback(
    (s: number): boolean => {
      if (s === 1) {
        if (!categoryId) { toast.error("Pilih Kategori terlebih dahulu"); return false; }
        if (!title.trim()) { toast.error("Judul Iklan wajib diisi"); return false; }
        if (!price || price === "0") { toast.error("Harga wajib diisi"); return false; }
        if (!province) { toast.error("Pilih Provinsi terlebih dahulu"); return false; }
        if (!city) { toast.error("Pilih Kota terlebih dahulu"); return false; }
        return true;
      }
      if (s === 2) {
        if (!description.trim()) { toast.error("Deskripsi mesin wajib diisi"); return false; }
        return true;
      }
      if (s === 3) {
        if (images.length < 1) { toast.error("Upload minimal 1 foto mesin"); return false; }
        return true;
      }
      return true;
    },
    [categoryId, title, price, province, city, images.length, description]
  );

  const nextStep = () => {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, 4));
  };
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  // --- Image handling ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setCompressing(true);
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        setImages((p) => [...p, compressed]);
      }
      toast.success(tr("photoAdded"));
    } catch (err: any) {
      toast.error(err?.message || tr("photoError"));
    } finally {
      setCompressing(false);
      e.target.value = "";
    }
  };

  // --- Mutation ---
  const mutation = useMutation({
    mutationFn: postListing,
    onSuccess: (listing: any) => {
      const wasDraft = savingDraft;
      setSavingDraft(false);
      // Clear persisted draft form data after successful post/draft-save
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast.success(wasDraft ? "Iklan disimpan (Belum Aktif)." : tr("adPosted"));
      if (wasDraft) {
        goHome();
      } else {
        goToProfilePanel("iklan-saya");
      }
    },
    onError: (e: any) => {
      setSavingDraft(false);
      toast.error(e.message || tr("postFailed"));
    },
  });

  // --- Submit ---
  const submit = async () => {
    if (!title || !categoryId || !description || !price || !city || !province) {
      toast.error(tr("completeFields"));
      return;
    }
    const selPkgPrice = paketMap[selectedPackage]?.price ?? 0;
    if (selPkgPrice > 0 && selectedPackage !== "simpan" && !paymentMethod) {
      toast.error(tr("choosePayment"));
      return;
    }
    // Paid package → open payment modal. The unique code is already fetched
    // reactively by the useEffect on selectedPackage change, so qrisAmount
    // and uniqueCode are always up-to-date for the currently-selected package.
    if (selPkgPrice > 0 && selectedPackage !== "simpan") {
      // Defensive: if the unique code hasn't loaded yet (rare race), the
      // modal still opens and shows the package price; user can wait for
      // the code to appear before transferring.
      setQrisModal(true);
      return;
    }
    doSubmit();
  };

  const doSubmit = () => {
    const finalImages = images.length ? images : PLACEHOLDER_IMAGES.slice(0, 1);
    const specObj: Record<string, string> = {};
    for (const s of specs) {
      if (s.k.trim() && s.v.trim()) specObj[s.k.trim()] = s.v.trim();
    }
    // Add optional fields from step 2 (Detail & Deskripsi)
    if (brand.trim()) specObj["Merk/Brand"] = brand.trim();
    if (modelType.trim()) specObj["Tipe/Model"] = modelType.trim();
    if (capacity.trim()) specObj["Kapasitas"] = capacity.trim();

    mutation.mutate({
      title,
      categoryId,
      description,
      price,
      priceType,
      condition: adType === "jasa" ? "jasa" : condition,
      availability,
      adType,
      brand: adType === "jasa" ? undefined : (brand || undefined),
      yearProduced: yearProduced || undefined,
      city,
      province,
      images: finalImages,
      specs: specObj,
      featured: selectedPackage === "spotlight" || selectedPackage === "highlight",
      package: selectedPackage,
      paymentMethod: paymentMethod || undefined,
      userId: user?.id,
      userName: user?.name,
      userPhone: user?.phone,
    });
  };

  // --- Draft saving ---
  const handleSaveDraft = () => {
    if (!title.trim()) { toast.error("Judul wajib diisi untuk menyimpan dulu."); return; }
    setSavingDraft(true);
    const finalImages = images.length ? images : PLACEHOLDER_IMAGES.slice(0, 1);
    const specObj: Record<string, string> = {};
    for (const s of specs) {
      if (s.k.trim() && s.v.trim()) specObj[s.k.trim()] = s.v.trim();
    }
    mutation.mutate({
      title,
      categoryId: categoryId || undefined,
      description: description || "(Draft)",
      price: price || "0",
      priceType,
      condition: adType === "jasa" ? "jasa" : condition,
      availability,
      adType,
      brand: adType === "jasa" ? undefined : (brand || undefined),
      yearProduced: yearProduced || undefined,
      city: city || "Draft",
      province: province || "Draft",
      images: finalImages,
      specs: specObj,
      featured: false,
      package: "colek",
      userId: user?.id,
      userName: user?.name,
      userPhone: user?.phone,
      saveAsDraft: true,
    } as any);
  };

  // --- Helper: get category name ---
  const getCategoryName = () => {
    const cat = (cats ?? []).find((c) => c.id === categoryId);
    return cat ? categoryName(cat.name, mounted ? lang : "id") : "-";
  };

  // --- Success screen ---
  if (success) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center animate-fade-up">
        <div className="grid size-20 place-items-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-12 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-bold">{tr("postSuccess")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("postSuccessDesc")}
        </p>
        <Loader2 className="mt-4 size-5 animate-spin text-primary" />
      </div>
    );
  }

  // --- Package icon/color maps ---
  const pkgIconMap: Record<string, any> = { colek: Tag, sundul: TrendingUp, highlight: Zap, spotlight: Crown };
  const pkgColorMap: Record<string, string> = {
    colek: "border-blue-400 ring-1 ring-blue-200",
    sundul: "border-purple-400 ring-1 ring-purple-200",
    highlight: "border-orange-400 ring-1 ring-orange-200",
    spotlight: "border-amber-400 ring-1 ring-amber-200",
  };
  const pkgIconColorMap: Record<string, string> = {
    colek: "text-blue-500",
    sundul: "text-purple-500",
    highlight: "text-orange-500",
    spotlight: "text-amber-500",
  };
  const pkgSelectedColorMap: Record<string, string> = {
    colek: "border-green-500 ring-2 ring-green-400 bg-green-50/50",
    sundul: "border-green-500 ring-2 ring-green-400 bg-green-50/50",
    highlight: "border-green-500 ring-2 ring-green-400 bg-green-50/50",
    spotlight: "border-green-500 ring-2 ring-green-400 bg-green-50/50",
  };
  const pkgKeys = ["colek", "highlight", "spotlight", "sundul"];

  // --- Price display helper ---
  const priceDisplay = price ? Number(price.replace(/[^0-9]/g, "")).toLocaleString("de-DE") : "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 animate-fade-up">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Green step title + Reset button */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-green-600">
          Pasang Iklan (Step {step}/4)
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          className="h-8 gap-1.5 rounded-full border-red-300 px-3 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {/* Header with back arrow + centered title */}
      <div className="flex items-center gap-3 py-3">
        <button
          type="button"
          onClick={step === 1 ? goHome : prevStep}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold">Pasang Iklan</h1>
        <div className="w-10" />
      </div>

      {/* Progress Stepper */}
      <div className="mb-6">
        <div className="flex items-center justify-between px-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex flex-1 items-center">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "grid size-8 place-items-center rounded-full text-sm font-bold transition-all",
                    s < step
                      ? "bg-green-500 text-white"
                      : s === step
                        ? "bg-green-500 text-white ring-4 ring-green-100"
                        : "bg-gray-200 text-gray-400"
                  )}
                >
                  {s < step ? <Check className="size-4" /> : s}
                </div>
                <span
                  className={cn(
                    "mt-1 text-[10px] font-medium",
                    s <= step ? "text-green-600" : "text-gray-400"
                  )}
                >
                  {STEP_LABELS[s - 1]}
                </span>
              </div>
              {/* Connector line */}
              {s < 4 && (
                <div
                  className={cn(
                    "mx-1.5 h-0.5 flex-1 rounded-full transition-all",
                    s < step ? "bg-green-500" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="space-y-4">
        {/* ========== STEP 1: Informasi Dasar ========== */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Informasi Dasar</h2>

            {/* Kategori */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Kategori <span className="text-destructive">*</span>
              </Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full h-12 rounded-lg">
                  <SelectValue placeholder={tr("selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {(cats ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <CategoryIcon name={c.icon} className="size-4 shrink-0 text-primary" />
                        {categoryName(c.name, mounted ? lang : "id")}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!cats && (
                <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
              )}
            </div>

            {/* Judul Iklan */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Judul Iklan <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Mesin Press Hidrolik 100 Ton"
                maxLength={120}
                className="h-12 rounded-lg"
              />
            </div>

            {/* Harga */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Harga <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  Rp
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={priceDisplay}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    setPrice(digits);
                  }}
                  placeholder="contoh: 185.000.000"
                  maxLength={15}
                  className="h-12 rounded-lg pl-10"
                />
              </div>
            </div>

            {/* Kondisi */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Kondisi</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="w-full h-12 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baru">Baru</SelectItem>
                  <SelectItem value="bekas">Bekas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tahun */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tahun</Label>
              <Select value={yearProduced} onValueChange={setYearProduced}>
                <SelectTrigger className="w-full h-12 rounded-lg">
                  <SelectValue placeholder="Pilih tahun" />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Provinsi */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Provinsi <span className="text-destructive">*</span>
              </Label>
              <Select value={province} onValueChange={(v) => { setProvince(v); setCity(""); }}>
                <SelectTrigger className="w-full h-12 rounded-lg">
                  <SelectValue placeholder={tr("selectProvince")} />
                </SelectTrigger>
                <SelectContent>
                  {PROVINCES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Kota */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Kota <span className="text-destructive">*</span>
              </Label>
              <Select value={city} onValueChange={setCity} disabled={!province}>
                <SelectTrigger className="w-full h-12 rounded-lg">
                  <SelectValue placeholder={province ? tr("selectCity") : tr("selectProvinceFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {(PROVINCE_CITIES[province] || []).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* ========== STEP 3: Foto Mesin ========== */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Foto Mesin</h2>
            <p className="text-xs text-muted-foreground">
              Upload foto mesin (min. 1 foto)
            </p>

            {/* Photo grid: 2 columns */}
            <div className="grid grid-cols-2 gap-3">
              {/* Add photo button — always first */}
              <Popover open={photoMenuOpen} onOpenChange={setPhotoMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={compressing}
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white transition hover:border-green-400 hover:bg-green-50/50"
                  >
                    {compressing ? (
                      <Loader2 className="size-8 animate-spin text-green-500" />
                    ) : (
                      <Camera className="size-8 text-green-500" />
                    )}
                    <span className="text-xs font-medium text-gray-500">
                      {compressing ? "Mengompresi..." : "Tambah Foto"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <FileImage className="size-4 text-primary" />
                    {tr("selectFile")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      cameraInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <Camera className="size-4 text-primary" />
                    {tr("camera")}
                  </button>
                </PopoverContent>
              </Popover>

              {/* Uploaded photos */}
              {images.map((img, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                  <img src={img} alt={""} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="size-4" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                      {tr("mainPhoto")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* No photos yet fallback */}
            {images.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                <Upload className="mx-auto mb-1 size-5" />
                {tr("noPhotosYet")}
                <button
                  type="button"
                  onClick={() => setImages(PLACEHOLDER_IMAGES.slice(0, 3))}
                  className="ml-1 font-semibold text-primary hover:underline"
                >
                  {tr("useExample")}
                </button>
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              {images.length} foto diunggah {images.length < 1 && "(min. 1)"}
            </p>

            {/* Simpan Dulu button */}
            <div className="flex flex-col items-center gap-1.5">
              <Button
                type="button"
                className="w-fit gap-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                disabled={mutation.isPending || savingDraft}
                onClick={handleSaveDraft}
              >
                {savingDraft ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {savingDraft ? "Menyimpan..." : "Simpan Dulu"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Simpan dulu untuk menunda pasang iklan. Iklan tersimpan dengan status &quot;Belum Aktif&quot; dan bisa Anda terbitkan nanti.
              </p>
            </div>
          </div>
        )}

        {/* ========== STEP 2: Detail & Deskripsi ========== */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Detail &amp; Deskripsi</h2>

            {/* Deskripsi Mesin */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Deskripsi Mesin <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tuliskan detail spesifikasi, fitur, kondisi, dan informasi lainnya tentang mesin ini..."
                rows={6}
                maxLength={2000}
                className="rounded-lg resize-none"
              />
              <p className="text-right text-[11px] text-muted-foreground">{description.length}/2000</p>
            </div>

            {/* Spesifikasi (Opsional) */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Spesifikasi (Opsional)</h3>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Merk/Brand</Label>
                <Input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="contoh: Heidelberg, Komori, Roland"
                  className="h-12 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tipe/Model</Label>
                <Input
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  placeholder="contoh: SM 52, Lithrone, Aquarius"
                  className="h-12 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Kapasitas</Label>
                <Textarea
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="contoh: 100 Ton, 5000 sheets/jam, 3 phase 380V"
                  rows={3}
                  maxLength={500}
                  className="rounded-lg resize-none"
                />
                <p className="text-right text-[10px] text-muted-foreground">{capacity.length}/500</p>
              </div>
            </div>

          </div>
        )}

        {/* ========== STEP 4: Pilih Paket & Konfirmasi ========== */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Konfirmasi</h2>

            {/* Package Selection */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Pilih Paket Iklan</h3>
              <p className="text-xs text-muted-foreground">
                Pilih paket promosi agar iklan Anda lebih cepat laku.
              </p>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {pkgKeys.map((key) => {
                  const pk = paketMap[key];
                  const isUpgradeOnly = key === "sundul";
                  const Icon = pkgIconMap[key] || Tag;
                  const name = pk?.name || key;
                  const price = pk?.price ?? 0;
                  const origPrice = pk?.originalPrice ?? 0;
                  const dur = pk?.duration || 30;
                  const feats = (pk?.features && pk.features.length > 0) ? pk.features : [];
                  const disc = origPrice > 0 && origPrice > price ? Math.round((1 - price / origPrice) * 100) : 0;
                  const savings = origPrice > price ? origPrice - price : 0;
                  return (
                    <button
                      type="button"
                      key={key}
                      disabled={isUpgradeOnly}
                      onClick={() => {
                        setSelectedPackage(key);
                        setShowPayment(price > 0);
                        setPaymentMethod("");
                        // Reset unique-code state so the total briefly shows
                        // just the new package price while the useEffect
                        // fetches a fresh, DIFFERENT code for the new package.
                        setUniqueCode(0);
                        setQrisAmount(price);
                      }}
                      className={cn(
                        "relative rounded-xl border-2 bg-card p-3 text-left transition",
                        isUpgradeOnly
                          ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
                          : selectedPackage === key
                            ? pkgSelectedColorMap[key] || "border-primary ring-2 ring-primary"
                            : (pkgColorMap[key] || "border-border") + " hover:shadow-md"
                      )}
                      title={isUpgradeOnly ? "Paket Colek hanya untuk iklan yang sudah terbit (upgrade)" : undefined}
                    >
                      {key === "highlight" && !isUpgradeOnly && (
                        <span className="absolute -top-2 left-2 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground">Populer</span>
                      )}
                      {isUpgradeOnly && (
                        <span className="absolute -top-2 right-1 rounded-full bg-slate-500 px-1.5 py-0.5 text-[7px] font-bold uppercase text-white">Upgrade saja</span>
                      )}
                      {disc > 0 && (
                        <span className={cn(
                          "absolute -top-2 right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold text-white",
                          key === "highlight" && "-top-7"
                        )}>-{disc}%</span>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="grid size-7 place-items-center rounded-md bg-secondary">
                          <Icon className={cn("size-4", pkgIconColorMap[key] || "text-muted-foreground")} />
                        </span>
                        {selectedPackage === key && !isUpgradeOnly && (
                          <span className="rounded-full bg-green-500 p-0.5">
                            <CheckCircle2 className="size-3 text-white" />
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs font-bold">{name}</p>
                      <p className="mt-0.5 text-sm font-extrabold text-primary">
                        {formatRupiahFull(price)}
                        {origPrice > 0 && origPrice > price && (
                          <span className="ml-1 text-[10px] font-medium text-muted-foreground line-through">
                            {formatRupiahFull(origPrice)}
                          </span>
                        )}
                        <span className="text-[10px] font-normal text-muted-foreground">/{dur}hari</span>
                      </p>
                      {savings > 0 && (
                        <p className="mt-0.5 text-[10px] font-semibold text-red-500">Hemat {formatRupiahFull(savings)}</p>
                      )}
                      {feats.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {feats.map((f: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-[10px] leading-tight text-foreground">
                              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-green-500" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment method for paid packages */}
            {showPayment && (paketMap[selectedPackage]?.price ?? 0) > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Pembayaran</h3>
                <p className="text-xs text-muted-foreground">
                  Pilih metode pembayaran untuk mengaktifkan iklan Anda.
                </p>

                {/* Live payment summary — updates immediately when package
                    changes. Shows: harga paket + kode unik = total. */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Harga Paket {paketMap[selectedPackage]?.name || selectedPackage}</span>
                    <span className="font-semibold text-foreground">{formatRupiahFull(paketMap[selectedPackage]?.price ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Kode Unik (3 digit)</span>
                    <span className="font-bold text-primary">
                      {uniqueCode > 0 ? String(uniqueCode).padStart(3, "0") : "..."}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5">
                    <span className="font-semibold text-foreground">Total Transfer</span>
                    <span className="text-base font-extrabold text-primary">{formatRupiahFull(qrisAmount)}</span>
                  </div>
                  <p className="pt-0.5 text-[10px] text-muted-foreground">
                    Kode unik berbeda untuk setiap paket & pembayar — tidak akan sama dengan pembayar lain.
                  </p>
                </div>

                <div className="grid gap-2">
                  {[
                    { key: "bca", label: "Transfer ke Blu BCA", desc: "Transfer manual ke rekening Blu BCA" },
                    { key: "qris", label: "QRIS GoPay", desc: "Scan QR dari GoPay / e-wallet" },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.key}
                      onClick={() => setPaymentMethod(m.key)}
                      className={cn(
                        "rounded-lg border-2 p-3 text-left transition",
                        paymentMethod === m.key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent"
                      )}
                    >
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                    </button>
                  ))}
                </div>
                {paymentMethod && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700">
                    <CheckCircle2 className="mr-1 inline size-4" />
                    Pembayaran via {paymentMethod.toUpperCase()} dipilih.
                    <br />
                    <span className="text-[10px] text-orange-600">Simulasi pembayaran — iklan langsung aktif setelah konfirmasi.</span>
                  </div>
                )}
              </div>
            )}

            {/* Ringkasan Iklan (Summary) */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Ringkasan Iklan</h3>

              {/* Thumbnail + Title + Price */}
              <div className="flex gap-3">
                <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border">
                  <img
                    src={images[0] || "/logo.svg"}
                    alt=""
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{title || "-"}</p>
                  <p className="mt-1 text-base font-extrabold text-green-600">
                    {price ? `Rp ${priceDisplay}` : "-"}
                  </p>
                  {city && province && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {city}, {province}
                    </p>
                  )}
                </div>
              </div>

              {/* Summary details */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kategori</span>
                  <span className="font-medium text-foreground">{getCategoryName()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kondisi</span>
                  <span className="font-medium text-foreground">
                    {condition === "baru" ? "Baru" : condition === "bekas" ? "Bekas" : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tahun</span>
                  <span className="font-medium text-foreground">{yearProduced || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deskripsi</span>
                  <span className="font-medium text-foreground max-w-[60%] text-right truncate">
                    {description ? (description.length > 60 ? description.slice(0, 60) + "..." : description) : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Foto</span>
                  <span className="font-medium text-foreground">{images.length} foto</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom action button */}
      <div className="sticky bottom-0 left-0 right-0 -mx-4 mt-6 border-t border-border bg-background px-4 pb-4 pt-3 dark:border-transparent">
        {step < 4 ? (
          <Button
            type="button"
            onClick={nextStep}
            className="w-full h-12 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 gap-2"
          >
            {step === 3 ? "Lanjut" : "Lanjut"}
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={submit}
            className="w-full h-12 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Tag className="size-4" />
            )}
            {mutation.isPending
              ? "Memproses..."
              : (paketMap[selectedPackage]?.price ?? 0) > 0 && paymentMethod
                ? "Bayar & Pasang"
                : "Publikasikan"}
          </Button>
        )}
      </div>

      {/* QRIS PAYMENT MODAL — full screen overlay */}
      {qrisModal && (
        <div className="no-scrollbar fixed inset-0 z-[70] overflow-y-auto bg-background md:overflow-hidden">
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 sm:py-6 md:h-screen">
            {/* Header */}
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h2 className="text-xl font-bold sm:text-2xl">
                {paymentMethod === "bca" ? "Transfer ke Blu BCA" : "Pembayaran QRIS"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setQrisModal(false);
                  setProofImage("");
                }}
                className="grid size-10 place-items-center rounded-full border border-border bg-card hover:bg-accent"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="grid flex-1 gap-6 md:grid-cols-2 md:overflow-hidden">
              {/* LEFT — instructions + upload proof */}
              <div className="order-2 space-y-3 md:order-1 md:overflow-hidden">
                {/* Instructions */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Cara Pembayaran:</p>
                  {paymentMethod === "bca" ? (
                    <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                      <li>Buka aplikasi m-banking / ATM Blu BCA</li>
                      <li>Transfer ke rekening <strong className="text-foreground">0011 2208 8800</strong> a.n. Lina Listiawati</li>
                      <li>Transfer jumlah <strong className="text-foreground">{formatRupiahFull(qrisAmount)}</strong> (termasuk kode unik <strong className="text-primary">{uniqueCode > 0 ? String(uniqueCode).padStart(3, "0") : "-"}</strong>)</li>
                      <li>Konfirmasi & selesaikan transfer</li>
                      <li>Upload foto / screenshot bukti transfer di bawah</li>
                    </ol>
                  ) : (
                    <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                      <li>Buka aplikasi e-wallet / m-banking</li>
                      <li>Pilih menu Scan / Bayar QRIS</li>
                      <li>Arahkan kamera ke QR code di sebelah kanan</li>
                      <li>Bayar jumlah <strong className="text-foreground">{formatRupiahFull(qrisAmount)}</strong> (termasuk kode unik <strong className="text-primary">{uniqueCode > 0 ? String(uniqueCode).padStart(3, "0") : "-"}</strong>)</li>
                      <li>Konfirmasi & selesaikan pembayaran</li>
                      <li>Upload foto / screenshot bukti pembayaran di bawah</li>
                    </ol>
                  )}
                </div>

                {/* Upload proof of payment */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-2 text-sm font-bold">Kirim Bukti Pembayaran</p>
                  {proofImage ? (
                    <div className="relative">
                      <img src={proofImage} alt="Bukti Pembayaran" className="max-h-40 w-full rounded-lg border border-border object-contain" />
                      <button
                        type="button"
                        onClick={() => setProofImage("")}
                        className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-red-500 text-white shadow"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition hover:border-primary hover:bg-accent">
                      <Upload className="size-8 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Klik untuk upload bukti pembayaran</span>
                      <span className="text-[10px] text-muted-foreground/70">JPG, PNG (maks 100KB)</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressImage(file);
                            setProofImage(compressed);
                            toast.success("Bukti pembayaran diunggah");
                          } catch (err: any) {
                            toast.error("Gagal upload: " + (err?.message || ""));
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setQrisModal(false);
                      setProofImage("");
                      toast.info("Pembayaran dibatalkan");
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    disabled={mutation.isPending || uploadingProof || !proofImage}
                    onClick={async () => {
                      const pkgName = paketMap[selectedPackage]?.name || selectedPackage;

                      setUploadingProof(true);
                      try {
                        // === Ad image (gambar iklan) ===
                        // images[0] is a compressed data URL; fall back to a
                        // placeholder if the user somehow has no photo.
                        const adImage = images[0] || PLACEHOLDER_IMAGES[0];

                        // === Proof image (gambar bukti transfer) ===
                        const matches = proofImage.match(/^data:(image\/\w+);base64,(.+)$/);
                        if (!matches) { toast.error("Format gambar tidak valid"); return; }
                        const ext = matches[1] === "image/jpeg" ? "jpg" : matches[1].split("/")[1];
                        const byteString = atob(matches[2]);
                        const buf = new Uint8Array(byteString.length);
                        for (let i = 0; i < byteString.length; i++) buf[i] = byteString.charCodeAt(i);
                        const blob = new Blob([buf], { type: matches[1] });
                        const fileName = `bukti-pembayaran-${pkgName.toLowerCase()}-${Date.now()}.${ext}`;

                        // If the ad image is a data URL, upload it too so we
                        // can include a public URL in the WhatsApp caption.
                        // (Remote URLs are included as-is.)
                        let adImageUrl: string = adImage;
                        if (adImage.startsWith("data:image/")) {
                          try {
                            const adUp = await fetch("/api/upload-proof", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ image: adImage }),
                            });
                            if (adUp.ok) {
                              const adData = await adUp.json();
                              if (adData?.url) adImageUrl = adData.url;
                            }
                          } catch { /* keep data URL fallback */ }
                        }

                        // === WhatsApp caption (includes BOTH ad image URL + proof info) ===
                        const caption =
                          `*Bukti Pembayaran Iklan Gomesin*\n\n` +
                          `Paket: ${pkgName}\n` +
                          `Jumlah: ${formatRupiahFull(qrisAmount)}\n` +
                          `Kode Unik: ${uniqueCode > 0 ? String(uniqueCode).padStart(3, "0") : "-"}\n` +
                          `User: ${user?.name || "-"}\n` +
                          `Email: ${user?.email || "-"}\n` +
                          `Judul Iklan: ${title}\n\n` +
                          `Gambar Iklan:\n${adImageUrl}`;

                        // 1) WhatsApp share — uploads proof image, opens wa.me
                        //    with caption (which already contains the ad image URL).
                        const result = await shareImageToWhatsApp({ blob, fileName, caption, phone: "6285888082208" });
                        if (result.status === "shared") toast.success("Gambar bukti dibagikan ke WhatsApp!");
                        else if (result.status === "opened") toast.success("Bukti pembayaran terkirim ke WhatsApp admin!");
                        else if (result.status === "cancelled") { setUploadingProof(false); return; }

                        // 2) Chat admin via socket — send TWO messages so the
                        //    admin sees both the ad image and the proof image
                        //    inline in the conversation.
                        if (user?.id) {
                          try {
                            const adminRes = await fetch("/api/admin/info");
                            if (adminRes.ok) {
                              const { admin } = (await adminRes.json()) as { admin: { id: string; name: string } | null };
                              const methodLabel = paymentMethod === "bca" ? "Transfer Blu BCA" : "QRIS";
                              const adCaption =
                                `*Gambar Iklan*\n\n` +
                                `Judul: ${title}\n` +
                                `Paket: ${pkgName}\n` +
                                `User: ${user.name || "-"} (${user.email || "-"})`;
                              const proofCaption =
                                `*Bukti Pembayaran Iklan*\n\n` +
                                `Judul Iklan: ${title}\n` +
                                `Paket: ${pkgName}\n` +
                                `Jumlah: ${formatRupiahFull(qrisAmount)}\n` +
                                `Kode Unik: ${uniqueCode > 0 ? String(uniqueCode).padStart(3, "0") : "-"}\n` +
                                `Metode: ${methodLabel}\n` +
                                `User: ${user.name || "-"} (${user.email || "-"})\n\n` +
                                `Bukti pembayaran terlampir. Mohon diverifikasi agar iklan segera aktif.`;

                              if (admin?.id) {
                                // Message 1: ad image
                                const ack1 = await sendMessage({
                                  senderId: user.id,
                                  receiverId: admin.id,
                                  content: adCaption,
                                  image: adImage,
                                  listingTitle: `Gambar Iklan — ${title}`,
                                });
                                if (!ack1?.ok) {
                                  await fetch("/api/messages", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      senderId: user.id,
                                      receiverId: admin.id,
                                      content: adCaption,
                                      image: adImage,
                                      listingTitle: `Gambar Iklan — ${title}`,
                                    }),
                                  });
                                }
                                // Message 2: payment proof image
                                const ack2 = await sendMessage({
                                  senderId: user.id,
                                  receiverId: admin.id,
                                  content: proofCaption,
                                  image: proofImage,
                                  listingTitle: `Bukti Pembayaran — ${title}`,
                                });
                                if (!ack2?.ok) {
                                  await fetch("/api/messages", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      senderId: user.id,
                                      receiverId: admin.id,
                                      content: proofCaption,
                                      image: proofImage,
                                      listingTitle: `Bukti Pembayaran — ${title}`,
                                    }),
                                  });
                                }
                                toast.success("Bukti pembayaran dikirim ke chat admin");
                              }
                            }
                          } catch (chatErr) {
                            console.error("Gagal kirim bukti ke chat admin:", chatErr);
                            toast.error("Bukti terkirim ke WhatsApp, tapi gagal ke chat admin");
                          }
                        }
                      } catch {
                        toast.error("Gagal mengirim bukti");
                      } finally {
                        setUploadingProof(false);
                      }
                      setQrisModal(false);
                      doSubmit();
                    }}
                  >
                    {uploadingProof ? <Loader2 className="size-4 animate-spin" /> : mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {uploadingProof ? "Mengirim bukti..." : mutation.isPending ? "Memproses..." : "Kirim & Pasang Iklan"}
                  </Button>
                </div>
                {!proofImage && (
                  <p className="text-center text-[11px] text-amber-600">Upload bukti pembayaran dulu untuk melanjutkan</p>
                )}
              </div>

              {/* RIGHT — total + QR code / BCA info */}
              <div className="order-1 flex flex-col items-center justify-start pb-6 md:order-2 md:pb-0">
                {/* Total */}
                <div className="mb-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Pembayaran</p>
                  <p className="text-3xl font-extrabold text-primary sm:text-4xl">{formatRupiahFull(qrisAmount)}</p>
                  {uniqueCode > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Harga paket <span className="font-semibold text-foreground">{formatRupiahFull(qrisAmount - uniqueCode)}</span> +
                      Kode unik <span className="font-bold text-primary">{String(uniqueCode).padStart(3, "0")}</span>
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Kode unik 3 digit untuk identifikasi pembayar
                  </p>
                </div>
                {paymentMethod === "bca" ? (
                  <>
                    <div className="rounded-2xl border-2 border-blue-500 bg-white p-8 shadow-lg text-center">
                      <p className="text-sm font-bold text-blue-600">Blu BCA</p>
                      <p className="mt-2 text-3xl font-extrabold tracking-wider text-foreground">0011 2208 8800</p>
                      <p className="mt-2 text-sm text-muted-foreground">a.n. Lina Listiawati</p>
                    </div>
                    <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">Transfer ke rekening di atas</p>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border-2 border-border bg-white p-4 shadow-lg sm:p-6">
                      <img
                        src="/qris-gomesin.jpeg"
                        alt="QRIS Gomesin"
                        className="h-auto w-full max-w-[250px] object-contain"
                      />
                    </div>
                    <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">Scan QRIS untuk membayar</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
