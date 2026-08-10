"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Loader2 } from "lucide-react";
import type { Listing } from "@/lib/types";
import { ChatInner } from "../chat-widget";
import { useLang, translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";

async function fetchListing(slug: string) {
  const res = await fetch("/api/listings/" + slug);
  if (!res.ok) throw new Error("fail");
  return res.json() as Promise<{ listing: Listing }>;
}

/**
 * ChatView — full-page chat view (not a modal).
 *
 * Reached by clicking "Chat Penjual" on the listing detail page.
 * The store's `slug` field holds the listing slug so we can re-fetch the
 * listing (which contains the seller + owner info) and render ChatInner
 * in a full-page container that fills the viewport below the site Header.
 */
export function ChatView() {
  const slug = useStore((s) => s.slug);
  const goBack = useStore((s) => s.goBack);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => fetchListing(slug!),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data?.listing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold">{tr("notFound")}</p>
        <button
          onClick={goBack}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col overflow-hidden border-x border-border bg-background">
      <ChatInner listing={data.listing} onBack={goBack} variant="page" />
    </div>
  );
}
