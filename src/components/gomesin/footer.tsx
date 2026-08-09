"use client";

import { Cog, Mail, MapPin, Facebook, Instagram, Youtube, MessageCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";

export function Footer() {
  const goToListings = useStore((s) => s.goToListings);
  const goToPost = useStore((s) => s.goToPost);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  return (
    <footer className="mt-auto border-t border-border bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Cog className="size-5" />
              </span>
              <span className="text-xl font-extrabold tracking-tight">
                <span className="text-primary">go</span>mesin
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {tr("footerAbout")}
            </p>
            <div className="flex gap-2">
              <a
                href="#"
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-accent"
                aria-label="Facebook"
              >
                <Facebook className="size-4" />
              </a>
              <a
                href="#"
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-accent"
                aria-label="Instagram"
              >
                <Instagram className="size-4" />
              </a>
              <a
                href="#"
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-accent"
                aria-label="Youtube"
              >
                <Youtube className="size-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-foreground">{tr("footerCategories")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                [tr("footerCatCetak"), "mesin-cetak"],
                [tr("footerCatCNC"), "mesin-cnc-laser"],
                [tr("footerCatKompressor"), "kompressor-generator"],
                [tr("footerCatAlatBerat"), "alat-berat"],
                [tr("footerCatSparepart"), "sparepart"],
              ].map(([label, slug]) => (
                <li key={slug}>
                  <button
                    onClick={() => goToListings({ category: slug })}
                    className="hover:text-primary hover:underline"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-foreground">{tr("footerGomesin")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <button onClick={goToPost} className="hover:text-primary hover:underline">
                  {tr("footerSellMachine")}
                </button>
              </li>
              <li><a href="#" className="hover:text-primary hover:underline">{tr("footerHowToBuy")}</a></li>
              <li><a href="#" className="hover:text-primary hover:underline">{tr("footerSafeTips")}</a></li>
              <li><a href="#" className="hover:text-primary hover:underline">{tr("footerHelpCenter")}</a></li>
              <li><a href="#" className="hover:text-primary hover:underline">{tr("footerTerms")}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-foreground">{tr("contactUs")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Mail className="size-4 text-primary" /> gomesin0711@gmail.com</li>
              <li className="flex items-center gap-2"><MessageCircle className="size-4 text-primary" /> WhatsApp: 0858 8808 2208</li>
              <li className="flex items-center gap-2"><MapPin className="size-4 text-primary" /> Tangerang, Indonesia</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Gomesin. {tr("footerCopy")}</p>
          <p>{tr("footerMarketplace")}</p>
        </div>
      </div>
    </footer>
  );
}
