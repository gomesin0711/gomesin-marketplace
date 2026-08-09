"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { PackageActivateDialog } from "../package-activate-dialog";
import { Loader2, ChevronRight } from "lucide-react";
import { useLang, translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { Button } from "@/components/ui/button";
import type { Listing } from "@/lib/types";
import { parseListing } from "@/lib/types";

async function fetchListing(slug: string) {
  const res = await fetch("/api/listings/" + slug);
  if (!res.ok) throw new Error("Gagal memuat iklan");
  const data = await res.json();
  return data.listing as Listing;
}

export function UpgradeView() {
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const slug = useStore((s) => s.slug);
  const goBack = useStore((s) => s.goBack);
  const goToDashboard = useStore((s) => s.goToDashboard);
  const goToEdit = useStore((s) => s.goToEdit);
  const goToProfilePanel = useStore((s) => s.goToProfilePanel);

  const { data: listing, isLoading, isError } = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => fetchListing(slug!),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">Iklan tidak ditemukan.</p>
        <Button className="mt-4" onClick={goToDashboard}>Kembali ke Dashboard</Button>
      </div>
    );
  }

  return (
    <PackageActivateDialog
      listing={listing}
      open={true}
      onOpenChange={(o) => { if (!o) goBack(); }}
      onEdit={(slug) => goToEdit(slug)}
      onSuccess={() => goToProfilePanel("iklan-saya")}
    />
  );
}
