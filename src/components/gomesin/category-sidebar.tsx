"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { useLang, translations as i18nTranslations, categoryName } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { CategoryIcon } from "./category-icon";
import { LayoutGrid } from "lucide-react";

type Cat = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  listingCount: number;
};

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("fail");
  const data = await res.json();
  return data.categories as Cat[];
}

export function CategorySidebar() {
  const goToListings = useStore((s) => s.goToListings);
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  const cats: Cat[] = data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-2">
      {/* Header: grid icon */}
      <button
        onClick={() => goToListings({})}
        className="mb-2 flex w-full items-center justify-center rounded-lg bg-secondary p-3 text-primary transition hover:bg-primary/10"
        aria-label={tr("all")}
        title={tr("all")}
      >
        <LayoutGrid className="size-6" />
      </button>
      {/* Category icons only (vertical) */}
      <nav className="flex flex-col gap-1.5">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="size-14 animate-pulse rounded-lg bg-muted" />
            ))
          : cats.map((c) => (
              <button
                key={c.id}
                onClick={() => goToListings({ category: c.slug })}
                className="card-hover group grid size-14 place-items-center rounded-lg bg-secondary transition hover:bg-primary/10"
                aria-label={categoryName(c.name, mounted ? lang : "id")}
                title={categoryName(c.name, mounted ? lang : "id")}
              >
                <CategoryIcon name={c.icon} className="size-full p-2" />
              </button>
            ))}
      </nav>
    </div>
  );
}
