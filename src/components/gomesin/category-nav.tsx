"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { useLang, translations as i18nTranslations, categoryName } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { CategoryIcon } from "./category-icon";
import { LayoutGrid } from "lucide-react";

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("fail");
  const data = await res.json();
  return data.categories as Array<{
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
    listingCount: number;
  }>;
}

export function CategoryNav() {
  const goToListings = useStore((s) => s.goToListings);
  const { t, lang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <nav className="mx-auto flex max-w-7xl items-start gap-3 overflow-x-auto px-3 py-2.5 no-scrollbar sm:gap-4 sm:px-4">
      <button
        onClick={() => goToListings({})}
        className="card-hover group flex w-14 shrink-0 flex-col items-center text-center sm:w-[72px]"
      >
        <span className="grid aspect-square w-full place-items-center rounded-lg bg-secondary transition group-hover:bg-primary/10">
          <LayoutGrid className="size-5 text-primary sm:size-6" />
        </span>
        <span className="mt-1.5 line-clamp-2 text-[9px] font-semibold leading-tight text-foreground sm:text-[10px]">
          {tr("all")}
        </span>
      </button>
      {isLoading
        ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex w-14 shrink-0 flex-col items-center sm:w-[72px]">
              <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
              <div className="mt-1.5 h-2 w-10 animate-pulse rounded bg-muted" />
            </div>
          ))
        : data?.map((c) => (
            <button
              key={c.id}
              onClick={() => goToListings({ category: c.slug })}
              className="card-hover group flex w-14 shrink-0 flex-col items-center text-center sm:w-[72px]"
            >
              <span className="grid aspect-square w-full place-items-center rounded-lg bg-secondary transition group-hover:bg-primary/10">
                <CategoryIcon name={c.icon} className="size-full p-1" />
              </span>
              <span className="mt-1.5 line-clamp-2 text-[9px] font-semibold leading-tight text-foreground sm:text-[10px]">
                {categoryName(c.name, mounted ? lang : "id")}
              </span>
            </button>
          ))}
    </nav>
  );
}
