"use client";

import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="vx-footer">
      <Image src="/vortexa-logo-sm.webp" alt="Vortexa" width={320} height={184} sizes="80px" />
      <p>&ldquo;One ticket, One Ride, Discover adventure Inside.&rdquo;</p>
      <p className="vx-mono">NOVEMBER 28–29, 2026, XIAMEN UNIVERSITY MALAYSIA</p>
    </footer>
  );
}
