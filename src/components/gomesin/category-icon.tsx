"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

// Flat cartoon machine illustrations (AI-generated, stored in /public/cat-icons).
// Each category maps to a cartoon image matching its machine type.

const MAP: Record<string, string> = {
  Printer: "/cat-icons/mesincetak.png",
  MonitorPrinter: "/cat-icons/mesindigitalprinting.png",
  Cog: "/cat-icons/mescnc.png",
  Disc3: "/cat-icons/mesinbubut.png",
  TreePine: "/cat-icons/mesinkayu.png",
  CookingPot: "/cat-icons/mesinmakanan.png",
  FlaskConical: "/cat-icons/mesinplastik.png",
  Zap: "/cat-icons/kompressor.png",
  Shirt: "/cat-icons/mesintekstil.png",
  Package: "/cat-icons/mesinkemasan.png",
  Truck: "/cat-icons/alatberat.png",
  Wrench: "/cat-icons/sparepart.png",
  HardHat: "/cat-icons/jasa.png",
};

const FALLBACK = "/cat-icons/mescnc.png";

export function CategoryIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const src = MAP[name] ?? FALLBACK;
  return (
    <Image
      src={src}
      alt=""
      width={120}
      height={120}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}
