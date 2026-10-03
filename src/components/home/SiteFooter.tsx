"use client";

import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="vx-footer">
      <Image src="/vortexa-logo-sm.webp" alt="Vortexa" width={320} height={184} />
      <p>&ldquo;One ticket, One Ride, Discover adventure Inside.&rdquo;</p>
      <p className="vx-mono">NOVEMBER 28–29, 2026 · XIAMEN UNIVERSITY MALAYSIA</p>
      <Link href="/login" className="vx-mono">
        STAFF &amp; STUDENT LOGIN →
      </Link>
    </footer>
  );
}
