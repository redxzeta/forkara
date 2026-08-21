// FILE: ForkaraLogo.tsx
// Purpose: Render the Forkara branding via the canonical public SVG assets.
// Layer: Shared app branding primitive

import type { ImgHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

const FORKARA_LOGO_SRC = {
  full: "/forkara-logo.svg",
  mark: "/forkara-mark.svg",
} as const;

interface ForkaraLogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  variant?: keyof typeof FORKARA_LOGO_SRC;
}

export function ForkaraLogo({ variant = "mark", className, alt, ...props }: ForkaraLogoProps) {
  return (
    <img
      src={FORKARA_LOGO_SRC[variant]}
      alt={alt ?? ""}
      draggable={false}
      {...props}
      className={cn("shrink-0", className)}
    />
  );
}
