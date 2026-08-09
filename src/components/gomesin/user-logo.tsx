"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ShieldCheck } from "lucide-react";

/**
 * UserLogo — menampilkan logo perusahaan jika ada, fallback ke initials.
 * Dipakai di: dashboard, seller, admin, profile, header, detail, chat-widget.
 */
export function UserLogo({
  logoImage,
  name,
  size = "size-12",
  rounded = "rounded-xl",
  showAdminIcon = false,
  className = "",
}: {
  logoImage?: string | null;
  name: string;
  size?: string;
  rounded?: string;
  showAdminIcon?: boolean;
  className?: string;
}) {
  const initials = (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (logoImage) {
    return (
      <div className={`${size} ${rounded} ${className} overflow-hidden border-4 border-white bg-white shadow-xl`}>
        <img src={logoImage} alt={name} className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`${size} ${rounded} ${className} grid place-items-center border-4 border-white bg-primary shadow-xl`}>
      {showAdminIcon ? (
        <ShieldCheck className="size-1/2 text-primary-foreground" />
      ) : (
        <span className="text-lg font-bold text-primary-foreground">{initials}</span>
      )}
    </div>
  );
}
