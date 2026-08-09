"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PROVINCES, formatRupiahFull } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "../category-icon";
import {
  Plus,
  X,
  ImagePlus,
  Loader2,
  CheckCircle2,
  ChevronRight,
  Tag,
  Upload,
  Camera,
  FileImage,
  ArrowLeft,
  Clock,
  XCircle,
  MapPin,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLang, translations as i18nTranslations, categoryName } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";

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

async function fetchListing(slug: string) {
  const res = await fetch("/api/listings/" + slug);
  if (!res.ok) throw new Error("fail");
  return res.json() as Promise<{ listing: any }>;
}

async function updateListing({ slug, payload }: { slug: string; payload: any }) {
  const res = await fetch("/api/listings/" + slug, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || tr("editUpdateFailed"));
  return data.listing;
}

export function EditAdView() {
  const slug = useStore((s) => s.slug);
  const goHome = useStore((s) => s.goHome);
  const goBack = useStore((s) => s.goBack);
  const goToDashboard = useStore((s) => s.goToDashboard);
  const goToProfilePanel = useStore((s) => s.goToProfilePanel);
  const goToDetail = useStore((s) => s.goToDetail);

  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 0,
  });

  const { data: listingData, isLoading: loadingListing } = useQuery({
    queryKey: ["listing-edit", slug],
    queryFn: () => fetchListing(slug!),
    enabled: !!slug,
  });

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState("negotiable");
  const [condition, setCondition] = useState("bekas");
  const [brand, setBrand] = useState("");
  const [yearProduced, setYearProduced] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [specs, setSpecs] = useState<{ k: string; v: string }[]>([{ k: "", v: "" }]);
  const [success, setSuccess] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill form when listing data loads
  useEffect(() => {
    if (listingData?.listing && !initialized) {
      const l = listingData.listing;
      setTitle(l.title || "");
      setCategoryId(l.categoryId || "");
      setDescription(l.description || "");
      setPrice(String(l.price || ""));
      setPriceType(l.priceType || "negotiable");
      setCondition(l.condition || "bekas");
      setBrand(l.brand || "");
      setYearProduced(l.yearProduced ? String(l.yearProduced) : "");
      setCity(l.city || "");
      setProvince(l.province || "");
      setImages(Array.isArray(l.images) ? l.images : []);
      const specEntries = Object.entries(l.specs || {});
      if (specEntries.length > 0) {
        setSpecs(specEntries.map(([k, v]) => ({ k, v: String(v) })));
      }
      setInitialized(true);
    }
  }, [listingData, initialized]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateListing,
    onSuccess: () => {
      setSuccess(true);
      toast.success(tr("editSuccess"));
      // Invalidate queries so dashboard & detail refresh automatically
      queryClient.invalidateQueries({ queryKey: ["dashboard-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing", slug] });
      setTimeout(() => {
        goToProfilePanel("iklan-saya");
      }, 1200);
    },
    onError: (e: any) => {
      toast.error(e.message || tr("editFailed"));
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setCompressing(true);
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        setImages((p) => [...p, compressed]);
      }
      toast.success(tr("editPhotoAdded"));
    } catch (err: any) {
      toast.error(err?.message || tr("editPhotoFailed"));
    } finally {
      setCompressing(false);
      e.target.value = "";
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !categoryId || !description || !price || !city || !province) {
      toast.error("Mohon lengkapi semua field wajib (*)");
      return;
    }
    const specObj: Record<string, string> = {};
    for (const s of specs) {
      if (s.k.trim() && s.v.trim()) specObj[s.k.trim()] = s.v.trim();
    }
    mutation.mutate({
      slug: slug!,
      payload: {
        title,
        categoryId,
        description,
        price,
        priceType,
        condition,
        brand: brand || undefined,
        yearProduced: yearProduced || undefined,
        city,
        province,
        images,
        specs: specObj,
      },
    });
  };

  if (loadingListing || !listingData?.listing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center animate-fade-up">
        <div className="grid size-20 place-items-center rounded-full bg-primary/10">
          <CheckCircle2 className="size-12 text-primary" />
        </div>
        <h2 className="mt-4 text-2xl font-bold">Iklan Berhasil Diperbarui!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Perubahan iklan Anda telah disimpan. Mengarahkan ke halaman Iklan Saya...
        </p>
        <Loader2 className="mt-4 size-5 animate-spin text-primary" />
      </div>
    );
  }

  const l = listingData.listing;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 animate-fade-up">
      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={goHome} className="hover:text-primary">{tr("home2")}</button>
        <ChevronRight className="size-3" />
        <button onClick={goBack} className="hover:text-primary">{tr("dashboardCrumb")}</button>
        <ChevronRight className="size-3" />
        <span className="text-foreground">Edit Iklan</span>
      </div>

      {/* header with status */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goToProfilePanel("iklan-saya")}
            className="grid size-10 place-items-center rounded-lg border border-border bg-card hover:bg-accent"
            aria-label="Kembali"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Edit Iklan</h1>
            <p className="text-sm">
              {l.status === "pending" && (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <Clock className="size-3.5" /> Menunggu verifikasi admin
                </span>
              )}
              {l.status === "active" && (
                <span className="inline-flex items-center gap-1 text-orange-600">
                  <CheckCircle2 className="size-3.5" /> Iklan aktif dan tayang
                </span>
              )}
              {l.status === "rejected" && (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <XCircle className="size-3.5" /> Iklan ditolak
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* LEFT: Form fields */}
        <div className="space-y-4">
          {/* category */}
          <Section title={tr("category")} required>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(cats ?? []).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition ${
                    categoryId === c.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <CategoryIcon name={c.icon} className="size-4 shrink-0 text-primary" />
                  <span className="line-clamp-1">{categoryName(c.name, mounted ? lang : "id")}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* basic info */}
          <Section title={tr("detailSection")} required>
            <Field label={tr("adTitle")} required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr("adTitlePlaceholder")}
                maxLength={120}
              />
            </Field>
            <Field label={tr("description")} required>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tr("descPlaceholder")}
                rows={5}
                maxLength={2000}
              />
              <p className="text-right text-[11px] text-muted-foreground">{description.length}/2000</p>
            </Field>
          </Section>

          {/* price & condition */}
          <Section title={tr("priceCondition")} required>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("priceLabel")} required>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={tr("pricePlaceholder")}
                />
              </Field>
              <Field label={tr("priceType")}>
                <RadioGroup
                  value={priceType}
                  onValueChange={setPriceType}
                  className="flex gap-4 pt-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="negotiable" id="pt-nego" />
                    <Label htmlFor="pt-nego" className="cursor-pointer text-sm">{tr("negotiable")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="fixed" id="pt-fixed" />
                    <Label htmlFor="pt-fixed" className="cursor-pointer text-sm">{tr("fixed")}</Label>
                  </div>
                </RadioGroup>
              </Field>
              <Field label={tr("condition")}>
                <RadioGroup
                  value={condition}
                  onValueChange={setCondition}
                  className="flex gap-4 pt-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="bekas" id="cd-bekas" />
                    <Label htmlFor="cd-bekas" className="cursor-pointer text-sm">{tr("used")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="baru" id="cd-baru" />
                    <Label htmlFor="cd-baru" className="cursor-pointer text-sm">{tr("new")}</Label>
                  </div>
                </RadioGroup>
              </Field>
              <Field label={tr("brand")}>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={tr("brandPlaceholder")} />
              </Field>
              <Field label={tr("yearProduced")}>
                <Input
                  type="number"
                  value={yearProduced}
                  onChange={(e) => setYearProduced(e.target.value)}
                  placeholder={tr("yearPlaceholder")}
                />
              </Field>
            </div>
          </Section>

          {/* specs */}
          <Section title={tr("specsOptional")}>
            <p className="-mt-1 mb-2 text-xs text-muted-foreground">{tr("specsDesc")}</p>
            <div className="space-y-2">
              {specs.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={s.k}
                    onChange={(e) =>
                      setSpecs((p) => p.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))
                    }
                    placeholder={tr("specName")}
                    className="flex-1"
                  />
                  <Input
                    value={s.v}
                    onChange={(e) =>
                      setSpecs((p) => p.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))
                    }
                    placeholder={tr("specValue")}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSpecs((p) => p.filter((_, j) => j !== i))}
                    disabled={specs.length === 1}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setSpecs((p) => [...p, { k: "", v: "" }])}
            >
              <Plus className="size-4" /> {tr("addSpec")}
            </Button>
          </Section>

          {/* location */}
          <Section title={tr("location")} required>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("city")} required>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={tr("cityPlaceholder")} />
              </Field>
              <Field label={tr("province")} required>
                <Select value={province} onValueChange={setProvince} key={`prov-${initialized}`}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tr("selectProvince")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          {/* images */}
          <Section title={tr("machinePhotos")}>
            <p className="-mt-1 mb-2 text-xs text-muted-foreground">{tr("uploadDesc")}</p>
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
            <div className="flex gap-2">
              <Popover open={photoMenuOpen} onOpenChange={setPhotoMenuOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" disabled={compressing}>
                    {compressing ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    {compressing ? tr("compressing") : tr("addPhoto")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <button
                    type="button"
                    onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click(); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <FileImage className="size-4 text-primary" />
                    {tr("selectFile")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhotoMenuOpen(false); cameraInputRef.current?.click(); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <Camera className="size-4 text-primary" />
                    {tr("camera")}
                  </button>
                </PopoverContent>
              </Popover>
            </div>
            {images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative size-20 overflow-hidden rounded-lg border border-border">
                    <img src={img} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <X className="size-3" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 rounded bg-primary px-1 py-0.5 text-[8px] font-bold text-primary-foreground">
                        {tr("mainPhoto")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT: Preview + Submit (sticky) */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {/* Live Preview Card */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Preview Iklan</p>
            <div className="overflow-hidden rounded-lg border border-border">
              {/* image */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                {images[0] ? (
                  <img src={images[0]} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-8" />
                  </div>
                )}
                {l.status === "pending" && (
                  <span className="absolute left-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Pending
                  </span>
                )}
                {l.status === "active" && (
                  <span className="absolute left-2 top-2 rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Aktif
                  </span>
                )}
              </div>
              {/* content */}
              <div className="space-y-1.5 p-3">
                <p className="text-base font-bold text-primary">
                  {price ? formatRupiahFull(parseInt(price) || 0) : tr("editPriceEmpty")}
                </p>
                <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                  {title || tr("editTitlePlaceholder")}
                </h3>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">
                  {description || tr("editDescPlaceholder")}
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><MapPin className="size-3" /> {city || "Kota"}</span>
                  <span>•</span>
                  <span>{condition === "baru" ? tr("commonBaru") : tr("commonBekas")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit buttons */}
          <div className="rounded-xl border border-border bg-card p-4">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full gap-2 bg-primary font-semibold"
              size="lg"
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {mutation.isPending ? tr("processing") : "Simpan Perubahan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => goToProfilePanel("iklan-saya")}
              className="mt-2 w-full"
            >
              {tr("cancel")}
            </Button>
          </div>

          {/* Tips */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-bold">💡 Tips Edit Iklan</p>
            <ul className="mt-1 space-y-0.5 text-amber-700">
              <li>• Judul yang jelas menarik lebih banyak pembeli</li>
              <li>• Foto berkualitas meningkatkan minat</li>
              <li>• Harga kompetitif = lebih cepat laku</li>
              <li>• Deskripsi lengkap: kondisi, tahun, kelengkapan</li>
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-1 text-base font-bold">
        {title}
        {required && <span className="text-destructive">*</span>}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
