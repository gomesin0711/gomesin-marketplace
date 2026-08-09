"use client";

import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Loader2, CheckCircle2, Sparkles, Zap, TrendingUp, Star, ImageIcon, Clock, AlertTriangle, XCircle, X, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatRupiahFull, type Listing } from "@/lib/types";
import { useLang, translations as i18nTranslations, listingTitle } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { compressImage } from "@/lib/image";
import { shareImageToWhatsApp } from "@/lib/share-image";
import { useChatSocket } from "@/lib/use-chat-socket";
import { useStore } from "@/lib/store";

type PackageKey = "simpan" | "colek" | "sundul" | "highlight" | "spotlight";

type PaymentMethod = "bca" | "qris";

const PACKAGES: Array<{
  key: PackageKey;
  name: string;
  price: number;
  originalPrice: number;
  duration: string;
  badge?: string;
  color: string;
  ring: string;
  icon: typeof Star;
  description: string;
}> = [
  {
    key: "colek",
    name: "Gold",
    price: 60000,
    originalPrice: 75000,
    duration: "30 hari",
    color: "border-blue-400 bg-blue-50",
    ring: "ring-blue-400",
    icon: CheckCircle2,
    description: "Tampil di bagian Premium, Badge Gold, Prioritas pencarian.",
  },
  {
    key: "sundul",
    name: "Colek",
    price: 30000,
    originalPrice: 50000,
    duration: "10 hari",
    color: "border-purple-400 bg-purple-50",
    ring: "ring-purple-400",
    icon: TrendingUp,
    description: "Iklan didorong ke posisi teratas.",
  },
  {
    key: "highlight",
    name: "Platinum",
    price: 68000,
    originalPrice: 120000,
    duration: "30 hari",
    badge: "Populer",
    color: "border-orange-400 bg-orange-50",
    ring: "ring-orange-400",
    icon: Zap,
    description: "Iklan ditandai border orange + muncul di atas.",
  },
  {
    key: "spotlight",
    name: "Titanium",
    price: 99000,
    originalPrice: 180000,
    duration: "30 hari",
    color: "border-amber-400 bg-amber-50",
    ring: "ring-amber-400",
    icon: Sparkles,
    description: "Tampilan terluas: 3 foto + latar amber + di puncak.",
  },
];

const PAYMENT_METHODS: Array<{
  key: PaymentMethod;
  name: string;
  desc: string;
  color: string;
}> = [
  { key: "bca", name: "Transfer ke BCA", desc: "Transfer manual ke rekening BCA", color: "border-blue-500" },
  { key: "qris", name: "QRIS GoPay", desc: "Scan QR dari GoPay / e-wallet", color: "border-purple-500" },
];

export function PackageActivateDialog({
  listing,
  open,
  onOpenChange,
  onEdit,
  onSuccess,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit: (slug: string) => void;
  onSuccess?: () => void;
}) {
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const queryClient = useQueryClient();
  const user = useStore((s) => s.user);
  const { sendMessage } = useChatSocket();

  // Fetch paket pricing from DB (admin can edit)
  const { data: paketData } = useQuery({
    queryKey: ["admin-paket"],
    queryFn: async () => {
      const res = await fetch("/api/admin/paket");
      if (!res.ok) return null;
      return res.json() as Promise<{ pakets: any[] }>;
    },
    staleTime: 0,
  });
  const paketMap: Record<string, { price: number; originalPrice: number; duration: number; name: string }> = {};
  (paketData?.pakets || []).forEach((p: any) => {
    paketMap[p.key] = { price: p.price, originalPrice: p.originalPrice ?? 0, duration: p.duration, name: p.name };
  });

  // Initialize selectedPackage from listing.packageType (or "colek" for simpan)
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>(() => {
    const p = (listing.packageType as PackageKey) || "colek";
    return p === "simpan" ? "colek" : p;
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bca");
  const [submitting, setSubmitting] = useState(false);
  const [qrisModal, setQrisModal] = useState(false);
  const [bcaModal, setBcaModal] = useState(false);
  const [proofImage, setProofImage] = useState<string>("");
  const [uploadingProof, setUploadingProof] = useState(false);

  // Lock body scroll saat QRIS/BCA page terbuka (hilangkan scrollbar browser).
  useEffect(() => {
    const lock = qrisModal || bcaModal;
    document.body.style.overflow = lock ? "hidden" : "";
    document.documentElement.style.overflow = lock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [qrisModal, bcaModal]);

  const isPending = listing.status === "pending";
  const isSundulDisabled = isPending;

  // Merge DB paket data into PACKAGES (override price/duration/name/originalPrice)
  const packages = PACKAGES.map((p) => {
    const db = paketMap[p.key];
    return db ? { ...p, price: db.price, originalPrice: db.originalPrice, duration: `${db.duration} hari`, name: db.name } : p;
  });
  const selectedPkg = packages.find((p) => p.key === selectedPackage) || packages[0];
  // needsPayment = selectedPackage !== "simpan" && price > 0
  // (all packages including Gold require payment — only "simpan" is free)
  const needsPayment = selectedPackage !== "simpan" && selectedPkg.price > 0;

  // Status info for listing summary
  const statusInfo =
    listing.status === "pending"
      ? { color: "bg-amber-500", text: tr("pendingVerification"), icon: Clock }
      : listing.status === "rejected" || (listing as any).violationFlag
      ? {
          color: "bg-red-500",
          text: (listing as any).violationFlag ? tr("violation") : tr("rejected"),
          icon: (listing as any).violationFlag ? AlertTriangle : XCircle,
        }
      : { color: "bg-orange-500", text: "Aktif", icon: CheckCircle2 };
  const StatusIcon = statusInfo.icon;

  // Current package label for listing summary
  const currentPkgLabel =
    listing.packageType === "spotlight"
      ? "Titanium"
      : listing.packageType === "highlight"
      ? "Platinum"
      : listing.packageType === "sundul"
      ? "Colek"
      : listing.packageType === "simpan"
      ? "Simpan (Draft)"
      : "Gold";

  // Button label: selalu "Upgrade" (dialog hanya dibuka untuk iklan aktif).
  const buttonLabel = "Upgrade";
  // Kode unik: fetch dari API (stored in DB, unik per user, tidak berubah).
  const [uniqueCode, setUniqueCode] = useState<number | null>(null);
  const currentUserId = useStore((s) => s.user?.id);

  useEffect(() => {
    if (!open || !listing.id || selectedPkg.price <= 0 || !currentUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/listings/unique-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: listing.id, userId: currentUserId, packageType: selectedPackage }),
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setUniqueCode(data.uniqueCode);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open, listing.id, currentUserId, selectedPackage, selectedPkg.price]);

  const qrisAmount = selectedPkg.price > 0 && uniqueCode !== null
    ? selectedPkg.price + uniqueCode
    : selectedPkg.price;

  const handleSubmit = async () => {
    if (needsPayment && !paymentMethod) {
      toast.error("Pilih metode pembayaran terlebih dahulu.");
      return;
    }
    // QRIS → tampilkan halaman QRIS dulu (upload bukti), baru submit.
    // BCA → tampilkan halaman transfer BCA dulu (upload bukti), baru submit.
    if (needsPayment && paymentMethod === "qris") {
      setQrisModal(true);
      return;
    }
    if (needsPayment && paymentMethod === "bca") {
      setBcaModal(true);
      return;
    }
    await doSubmit();
  };

  // Submit sebenarnya ke API (dipanggil setelah QRIS selesai atau langsung untuk BCA/GoPay).
  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/listings/${listing.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: selectedPackage,
          paymentMethod: needsPayment ? paymentMethod : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengaktifkan paket");
      toast.success(`Paket ${selectedPkg.name} berhasil diaktifkan!`);
      // Refresh dashboard + listings queries
      queryClient.invalidateQueries({ queryKey: ["dashboard-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing"] });
      if (onSuccess) {
        onSuccess();
      } else {
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal mengaktifkan paket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    {/* ===== UPGRADE PAKET PAGE (fullscreen, 2 kolom di desktop) ===== */}
    {open && !qrisModal && !bcaModal && (
      <div className="fixed inset-0 z-[60] flex h-screen flex-col overflow-hidden bg-background">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto px-4 py-4 sm:py-6 md:overflow-hidden">
          {/* Header */}
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Upgrade Paket Iklan</h1>
              <p className="text-sm text-muted-foreground">Pilih paket untuk meningkatkan visibilitas iklan Anda.</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card hover:bg-accent"
              aria-label="Tutup"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Content 2 kolom (desktop) / 1 kolom (mobile) */}
          <div className="grid flex-1 gap-6 md:grid-cols-2 md:overflow-hidden">

            {/* LEFT — gambar iklan + detail */}
            <div className="space-y-3 md:overflow-y-auto md:pr-2">
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {/* Gambar utama iklan (besar) */}
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                  {listing.images?.[0] ? (
                    <Image
                      src={listing.images[0]}
                      alt={listingTitle(listing, mounted ? lang : "id")}
                      fill
                      className="object-cover"
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-12" />
                    </div>
                  )}
                </div>
                {/* Detail iklan */}
                <div className="space-y-2 p-4">
                  <p className="line-clamp-2 text-base font-semibold text-foreground">
                    {listingTitle(listing, mounted ? lang : "id")}
                  </p>
                  <p className="text-xl font-bold text-primary">
                    {formatRupiahFull(listing.price)}
                    {listing.priceType === "negotiable" && (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">Nego</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase text-white",
                        statusInfo.color
                      )}
                    >
                      <StatusIcon className="size-3" />
                      {statusInfo.text}
                    </span>
                    <span className="inline-flex items-center rounded bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Paket saat ini: {currentPkgLabel}
                    </span>
                  </div>
                  {/* Info tambahan */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-xs">
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Kondisi</span>
                      <span className="font-medium">{listing.condition === "baru" ? "Baru" : "Bekas"}</span>
                    </div>
                    {listing.brand && (
                      <div className="flex justify-between border-b border-border/50 pb-1">
                        <span className="text-muted-foreground">Brand</span>
                        <span className="font-medium">{listing.brand}</span>
                      </div>
                    )}
                    {listing.yearProduced && (
                      <div className="flex justify-between border-b border-border/50 pb-1">
                        <span className="text-muted-foreground">Tahun</span>
                        <span className="font-medium">{listing.yearProduced}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Lokasi</span>
                      <span className="font-medium">{listing.city}</span>
                    </div>
                  </div>
                  {/* Thumbnail galeri */}
                  {listing.images && listing.images.length > 1 && (
                    <div className="flex gap-1.5 pt-2">
                      {listing.images.slice(0, 5).map((img, i) => (
                        <div key={i} className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt="" className="size-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT — paket + metode pembayaran + total + footer */}
            <div className="flex flex-col space-y-3 md:overflow-y-auto md:pl-2">

        {/* Package cards */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {packages.map((p) => {
            const isSel = selectedPackage === p.key;
            const PkgIcon = p.icon;
            const isDisabled = p.key === "sundul" && isSundulDisabled;
            return (
              <button
                key={p.key}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  setSelectedPackage(p.key);
                  // Reset unique-code so the total briefly shows just the new
                  // package price while the useEffect fetches a fresh, DIFFERENT
                  // code for the newly-selected package.
                  setUniqueCode(null);
                }}
                className={cn(
                  "relative rounded-lg border-2 p-3 text-left transition",
                  p.color,
                  isSel ? cn("ring-2", p.ring) : "opacity-90 hover:opacity-100",
                  isDisabled && "cursor-not-allowed opacity-40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <PkgIcon
                      className={cn(
                        "size-4",
                        p.key === "spotlight"
                          ? "text-amber-600"
                          : p.key === "highlight"
                          ? "text-orange-600"
                          : p.key === "sundul"
                          ? "text-purple-600"
                          : "text-blue-600"
                      )}
                    />
                    <span className="text-sm font-bold text-foreground">{p.name}</span>
                  </div>
                  {p.badge && <Badge className="bg-primary text-[9px] text-white">{p.badge}</Badge>}
                  {p.originalPrice > 0 && p.originalPrice > p.price && (
                    <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      -{Math.round((1 - p.price / p.originalPrice) * 100)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-extrabold text-foreground">
                  Rp {p.price.toLocaleString("id-ID")}
                  {p.originalPrice > 0 && p.originalPrice > p.price && (
                    <span className="ml-1.5 text-xs font-medium text-muted-foreground line-through">
                      Rp {p.originalPrice.toLocaleString("id-ID")}
                    </span>
                  )}
                  <span className="ml-1 text-xs font-medium text-muted-foreground">/ {p.duration}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</p>
                {isDisabled && (
                  <p className="mt-1 text-[10px] font-semibold text-red-600">
                    Tidak tersedia untuk iklan pending.
                  </p>
                )}
                {isSel && (
                  <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-white">
                    <CheckCircle2 className="size-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Payment method section (only for paid packages) */}
        {needsPayment && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-bold text-foreground">Metode Pembayaran</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PAYMENT_METHODS.map((m) => {
                const isSel = paymentMethod === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPaymentMethod(m.key)}
                    className={cn(
                      "rounded-lg border-2 p-2 text-left transition",
                      isSel ? cn("bg-secondary", m.color) : "border-border bg-background hover:bg-accent"
                    )}
                  >
                    <p className="text-xs font-bold text-foreground">{m.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Total */}
        {needsPayment && (
          <div className="rounded-lg bg-secondary/60 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Harga Paket</span>
              <span className="text-lg font-extrabold text-primary">
                {formatRupiahFull(selectedPkg.price)}
              </span>
            </div>
            {uniqueCode !== null && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Kode Unik (3 digit)</span>
                <span className="text-sm font-bold text-amber-600">+{String(uniqueCode).padStart(3, '0')}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5">
              <span className="text-sm font-bold text-foreground">Total Transfer</span>
              <span className="text-xl font-extrabold text-primary">
                {formatRupiahFull(qrisAmount)}
              </span>
            </div>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex flex-col gap-2 pb-6 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEdit(listing.slug);
            }}
            className="w-full gap-1.5 sm:w-auto"
          >
            <Edit className="size-4" /> Edit Iklan
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (needsPayment && !paymentMethod)}
            className="w-full gap-1.5 bg-primary sm:w-auto"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {submitting ? "Memproses..." : buttonLabel}
          </Button>
        </div>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* ===== QRIS PAYMENT PAGE (overlay fullscreen, sama persis seperti post-ad) ===== */}
      {qrisModal && (
        <div className="no-scrollbar fixed inset-0 z-[70] overflow-y-auto bg-background md:overflow-hidden">
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 sm:py-6 md:h-screen">
            {/* Header */}
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h2 className="text-xl font-bold sm:text-2xl">Pembayaran QRIS</h2>
              <button
                type="button"
                onClick={() => { setQrisModal(false); setProofImage(""); }}
                className="grid size-10 place-items-center rounded-full border border-border bg-card hover:bg-accent"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content — scrollable on mobile, fit on desktop.
                Urutan: QR+Total (kanan) di-render PERTAMA di DOM supaya di mobile
                tampil di atas (order-first), instruksi+upload di bawah. Di desktop
                pakai md:order-2/1 untuk kembalikan layout 2 kolom (kiri instr, kanan QR). */}
            <div className="grid flex-1 gap-6 md:grid-cols-2 md:overflow-hidden">
              {/* LEFT — instructions + upload proof (di mobile tampil di BAWAH QR) */}
              <div className="order-2 space-y-3 md:order-1 md:overflow-hidden">
                {/* Instructions */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Cara Pembayaran:</p>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                    <li>Buka aplikasi e-wallet / m-banking</li>
                    <li>Pilih menu Scan / Bayar QRIS</li>
                    <li>Arahkan kamera ke QR code di sebelah kanan</li>
                    <li>Pastikan jumlah sesuai: <strong className="text-foreground">{formatRupiahFull(qrisAmount)}</strong></li>
                    <li>Konfirmasi & selesaikan pembayaran</li>
                    <li>Upload foto / screenshot bukti pembayaran di bawah</li>
                  </ol>
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
                      <span className="text-[10px] text-muted-foreground/70">JPG, PNG (maks 200KB)</span>
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
                    onClick={() => { setQrisModal(false); setProofImage(""); toast.info("Pembayaran dibatalkan"); }}
                  >
                    Batal
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    disabled={submitting || uploadingProof || !proofImage}
                    onClick={async () => {
                      setUploadingProof(true);
                      try {
                        // === Ad image (gambar iklan) ===
                        const adImage = listing.images?.[0] || "";

                        // === Proof image (gambar bukti transfer) ===
                        const dataUrlPrefix = proofImage.substring(0, proofImage.indexOf(','));
                        const base64Data = proofImage.substring(proofImage.indexOf(',') + 1);
                        if (!dataUrlPrefix || !base64Data) { toast.error("Format gambar tidak valid"); return; }
                        const mimeMatch = dataUrlPrefix.match(/image\/(\w+)/);
                        const mime = mimeMatch ? mimeMatch[1] : 'jpeg';
                        const ext = mime === 'jpeg' ? 'jpg' : mime;
                        const byteString = atob(base64Data);
                        const buf = new Uint8Array(byteString.length);
                        for (let i = 0; i < byteString.length; i++) buf[i] = byteString.charCodeAt(i);
                        const blob = new Blob([buf], { type: `image/${mime}` });
                        const fileName = `${sanitizeFileName(user?.name || user?.email || "bukti-pembayaran")}.${ext}`;

                        // If ad image is a data URL, upload it to get a public URL
                        // for the WhatsApp caption. Remote URLs are used as-is.
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

                        const caption =
                          `*Bukti Pembayaran Upgrade Iklan Gomesin*\n\n` +
                          `Paket: ${selectedPkg.name}\n` +
                          `Jumlah: ${formatRupiahFull(qrisAmount)}\n` +
                          `Kode Unik: ${uniqueCode !== null ? String(uniqueCode).padStart(3, "0") : "-"}\n` +
                          `Metode: QRIS\n` +
                          `Judul Iklan: ${listingTitle(listing, mounted ? lang : "id")}\n\n` +
                          `Gambar Iklan:\n${adImageUrl}`;

                        // 1) WhatsApp — uploads proof, opens wa.me with caption.
                        const result = await shareImageToWhatsApp({ blob, fileName, caption, phone: "6285888082208" });
                        if (result.status === "shared") toast.success(`Paket ${selectedPkg.name} berhasil dibayar, mohon ditunggu verifikasi, Makasih!`);
                        else if (result.status === "opened") toast.success(`Paket ${selectedPkg.name} berhasil dibayar, mohon ditunggu verifikasi, Makasih!`);
                        else if (result.status === "cancelled") { setUploadingProof(false); return; }

                        // 2) Chat admin via socket — send TWO messages (ad image + proof).
                        if (user?.id) {
                          try {
                            const adminRes = await fetch("/api/admin/info");
                            if (adminRes.ok) {
                              const { admin } = (await adminRes.json()) as { admin: { id: string; name: string } | null };
                              const adCaption =
                                `*Gambar Iklan (Upgrade)*\n\n` +
                                `Judul: ${listingTitle(listing, mounted ? lang : "id")}\n` +
                                `Paket: ${selectedPkg.name}\n` +
                                `User: ${user.name || "-"} (${user.email || "-"})`;
                              const proofCaption =
                                `*Bukti Pembayaran Upgrade Iklan*\n\n` +
                                `Judul Iklan: ${listingTitle(listing, mounted ? lang : "id")}\n` +
                                `Paket: ${selectedPkg.name}\n` +
                                `Jumlah: ${formatRupiahFull(qrisAmount)}\n` +
                                `Kode Unik: ${uniqueCode !== null ? String(uniqueCode).padStart(3, "0") : "-"}\n` +
                                `Metode: QRIS\n` +
                                `User: ${user.name || "-"} (${user.email || "-"})\n\n` +
                                `Bukti pembayaran terlampir. Mohon diverifikasi.`;
                              if (admin?.id) {
                                if (adImage) {
                                  const ack1 = await sendMessage({
                                    senderId: user.id,
                                    receiverId: admin.id,
                                    content: adCaption,
                                    image: adImage,
                                    listingTitle: `Gambar Iklan — ${listingTitle(listing, mounted ? lang : "id")}`,
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
                                        listingTitle: `Gambar Iklan — ${listingTitle(listing, mounted ? lang : "id")}`,
                                      }),
                                    });
                                  }
                                }
                                const ack2 = await sendMessage({
                                  senderId: user.id,
                                  receiverId: admin.id,
                                  content: proofCaption,
                                  image: proofImage,
                                  listingTitle: `Bukti Pembayaran — ${listingTitle(listing, mounted ? lang : "id")}`,
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
                                      listingTitle: `Bukti Pembayaran — ${listingTitle(listing, mounted ? lang : "id")}`,
                                    }),
                                  });
                                }
                                toast.success("Bukti pembayaran dikirim ke chat admin");
                              }
                            }
                          } catch (chatErr) {
                            console.error("Gagal kirim bukti ke chat admin:", chatErr);
                          }
                        }
                      } catch {
                        toast.error("Gagal mengirim bukti");
                      } finally {
                        setUploadingProof(false);
                      }
                      // Submit upgrade + tutup semua.
                      setTimeout(async () => {
                        await doSubmit();
                        setQrisModal(false);
                        setProofImage("");
                      }, 500);
                    }}
                  >
                    {uploadingProof ? <Loader2 className="size-4 animate-spin" /> : submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {uploadingProof ? "Mengirim bukti..." : submitting ? "Memproses..." : "Kirim & Pasang Iklan"}
                  </Button>
                </div>
                {!proofImage && (
                  <p className="text-center text-[11px] text-amber-600">Upload bukti pembayaran dulu untuk melanjutkan</p>
                )}
              </div>

              {/* RIGHT — total pembayaran + QR code (di mobile tampil di ATAS) */}
              <div className="order-1 flex flex-col items-center justify-start pb-6 md:order-2 md:pb-0">
                {/* Total pembayaran above QR */}
                <div className="mb-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Pembayaran</p>
                  <p className="text-3xl font-extrabold text-primary sm:text-4xl">{formatRupiahFull(qrisAmount)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Harga paket + kode unik untuk identifikasi pembayar
                  </p>
                </div>
                {/* QR code */}
                <div className="rounded-2xl border-2 border-border bg-white p-4 shadow-lg sm:p-6">
                  <img
                    src="/qris-gomesin.jpeg"
                    alt="QRIS Gomesin"
                    className="h-auto w-full max-w-[250px] object-contain"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">Scan QRIS untuk membayar</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== BCA TRANSFER PAGE (fullscreen, mirip QRIS page) ===== */}
      {bcaModal && (
        <div className="no-scrollbar fixed inset-0 z-[70] overflow-y-auto bg-background md:overflow-hidden">
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 sm:py-6 md:h-screen">
            {/* Header */}
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h2 className="text-xl font-bold sm:text-2xl">Transfer ke BCA</h2>
              <button
                type="button"
                onClick={() => { setBcaModal(false); setProofImage(""); }}
                className="grid size-10 place-items-center rounded-full border border-border bg-card hover:bg-accent"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="grid flex-1 gap-6 md:grid-cols-2 md:overflow-hidden">
              {/* LEFT — instructions + upload proof */}
              <div className="space-y-3 md:overflow-y-auto">
                {/* Bank details */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Transfer ke Rekening BCA:</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>Bank: <strong className="text-foreground">BCA</strong></p>
                    <p>No. Rekening: <strong className="text-foreground text-base">8770338221</strong></p>
                    <p>a.n. <strong className="text-foreground">Lina Listiawati</strong></p>
                  </div>
                  <div className="mt-3 rounded-lg bg-blue-50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Jumlah Transfer</p>
                    <p className="text-2xl font-extrabold text-primary">{formatRupiahFull(qrisAmount)}</p>
                    <p className="text-[11px] text-muted-foreground">Harga paket + kode unik untuk identifikasi</p>
                  </div>
                </div>

                {/* Instructions */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Cara Pembayaran:</p>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                    <li>Buka aplikasi m-banking / ATM BCA</li>
                    <li>Transfer ke rekening <strong className="text-foreground">8770338221</strong> a.n. Lina Listiawati</li>
                    <li>Pastikan jumlah sesuai: <strong className="text-foreground">{formatRupiahFull(qrisAmount)}</strong></li>
                    <li>Konfirmasi & selesaikan transfer</li>
                    <li>Upload foto / screenshot bukti transfer di bawah</li>
                  </ol>
                </div>

                {/* Upload proof */}
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
                      <span className="text-[10px] text-muted-foreground/70">JPG, PNG (maks 200KB)</span>
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
                    onClick={() => { setBcaModal(false); setProofImage(""); toast.info("Pembayaran dibatalkan"); }}
                  >
                    Batal
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    disabled={submitting || uploadingProof || !proofImage}
                    onClick={async () => {
                      setUploadingProof(true);
                      try {
                        // === Ad image (gambar iklan) ===
                        const adImage = listing.images?.[0] || "";

                        // === Proof image (gambar bukti transfer) ===
                        const dataUrlPrefix = proofImage.substring(0, proofImage.indexOf(','));
                        const base64Data = proofImage.substring(proofImage.indexOf(',') + 1);
                        if (!dataUrlPrefix || !base64Data) { toast.error("Format gambar tidak valid"); return; }
                        const mimeMatch = dataUrlPrefix.match(/image\/(\w+)/);
                        const mime = mimeMatch ? mimeMatch[1] : 'jpeg';
                        const ext = mime === 'jpeg' ? 'jpg' : mime;
                        const byteString = atob(base64Data);
                        const buf = new Uint8Array(byteString.length);
                        for (let i = 0; i < byteString.length; i++) buf[i] = byteString.charCodeAt(i);
                        const blob = new Blob([buf], { type: `image/${mime}` });
                        const fileName = `${sanitizeFileName(user?.name || user?.email || "bukti-pembayaran")}.${ext}`;

                        // Upload ad image if it's a data URL (for WhatsApp caption).
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

                        const caption =
                          `*Bukti Pembayaran Upgrade Iklan Gomesin*\n\n` +
                          `Paket: ${selectedPkg.name}\n` +
                          `Jumlah: ${formatRupiahFull(qrisAmount)}\n` +
                          `Kode Unik: ${uniqueCode !== null ? String(uniqueCode).padStart(3, "0") : "-"}\n` +
                          `Metode: Transfer BCA\n` +
                          `Judul Iklan: ${listingTitle(listing, mounted ? lang : "id")}\n\n` +
                          `Gambar Iklan:\n${adImageUrl}`;

                        // 1) WhatsApp — uploads proof, opens wa.me with caption.
                        const result = await shareImageToWhatsApp({ blob, fileName, caption, phone: "6285888082208" });
                        if (result.status === "shared") toast.success(`Paket ${selectedPkg.name} berhasil dibayar, mohon ditunggu verifikasi, Makasih!`);
                        else if (result.status === "opened") toast.success(`Paket ${selectedPkg.name} berhasil dibayar, mohon ditunggu verifikasi, Makasih!`);
                        else if (result.status === "cancelled") { setUploadingProof(false); return; }

                        // 2) Chat admin via socket — send TWO messages (ad image + proof).
                        if (user?.id) {
                          try {
                            const adminRes = await fetch("/api/admin/info");
                            if (adminRes.ok) {
                              const { admin } = (await adminRes.json()) as { admin: { id: string; name: string } | null };
                              const adCaption =
                                `*Gambar Iklan (Upgrade)*\n\n` +
                                `Judul: ${listingTitle(listing, mounted ? lang : "id")}\n` +
                                `Paket: ${selectedPkg.name}\n` +
                                `User: ${user.name || "-"} (${user.email || "-"})`;
                              const proofCaption =
                                `*Bukti Pembayaran Upgrade Iklan*\n\n` +
                                `Judul Iklan: ${listingTitle(listing, mounted ? lang : "id")}\n` +
                                `Paket: ${selectedPkg.name}\n` +
                                `Jumlah: ${formatRupiahFull(qrisAmount)}\n` +
                                `Kode Unik: ${uniqueCode !== null ? String(uniqueCode).padStart(3, "0") : "-"}\n` +
                                `Metode: Transfer BCA\n` +
                                `User: ${user.name || "-"} (${user.email || "-"})\n\n` +
                                `Bukti pembayaran terlampir. Mohon diverifikasi.`;
                              if (admin?.id) {
                                if (adImage) {
                                  const ack1 = await sendMessage({
                                    senderId: user.id,
                                    receiverId: admin.id,
                                    content: adCaption,
                                    image: adImage,
                                    listingTitle: `Gambar Iklan — ${listingTitle(listing, mounted ? lang : "id")}`,
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
                                        listingTitle: `Gambar Iklan — ${listingTitle(listing, mounted ? lang : "id")}`,
                                      }),
                                    });
                                  }
                                }
                                const ack2 = await sendMessage({
                                  senderId: user.id,
                                  receiverId: admin.id,
                                  content: proofCaption,
                                  image: proofImage,
                                  listingTitle: `Bukti Pembayaran — ${listingTitle(listing, mounted ? lang : "id")}`,
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
                                      listingTitle: `Bukti Pembayaran — ${listingTitle(listing, mounted ? lang : "id")}`,
                                    }),
                                  });
                                }
                                toast.success("Bukti pembayaran dikirim ke chat admin");
                              }
                            }
                          } catch (chatErr) {
                            console.error("Gagal kirim bukti ke chat admin:", chatErr);
                          }
                        }
                      } catch { toast.error("Gagal mengirim bukti"); }
                      finally { setUploadingProof(false); }
                      setTimeout(async () => { await doSubmit(); setBcaModal(false); setProofImage(""); }, 500);
                    }}
                  >
                    {uploadingProof ? <Loader2 className="size-4 animate-spin" /> : submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {uploadingProof ? "Mengirim bukti..." : submitting ? "Memproses..." : "Kirim & Pasang Iklan"}
                  </Button>
                </div>
                {!proofImage && <p className="text-center text-[11px] text-amber-600">Upload bukti pembayaran dulu untuk melanjutkan</p>}
              </div>

              {/* RIGHT — bank info + QR code (kosong, info bank di kiri) */}
              <div className="flex flex-col items-center justify-center gap-4 pb-6 md:pb-0">
                <div className="rounded-2xl border-2 border-blue-500 bg-white p-8 shadow-lg text-center">
                  <p className="text-sm font-bold text-blue-600">BCA</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-wider text-foreground">8770338221</p>
                  <p className="mt-2 text-sm text-muted-foreground">a.n. Lina Listiawati</p>
                </div>
                <p className="text-center text-sm font-semibold text-muted-foreground">Transfer ke rekening di atas</p>
                <p className="text-center text-lg font-bold text-primary">{formatRupiahFull(qrisAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Sanitize user name/email to be filesystem-safe.
 * "John Doe" → "John_Doe"
 * "user@email.com" → "user_email.com"
 * Removes special chars that break URLs/filenames.
 */
function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "_")           // spaces → underscore
    .replace(/[@/\\?%*:|"<>]/g, "_") // special chars → underscore
    .replace(/_+/g, "_")              // collapse multiple underscores
    .substring(0, 50);               // max 50 chars
}
