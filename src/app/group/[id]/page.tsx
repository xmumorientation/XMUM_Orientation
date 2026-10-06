import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import GroupHome from "@/components/demo/GroupHome";
import { DEMO_GROUPS, getDemoGroup } from "@/components/demo/demo-data";
import { GROUP_PASS_COOKIE, verifyGroupPassToken } from "@/lib/group-pass";
import { isGroupPassCurrent } from "@/lib/group-pass-store";

/**
 * Group Homepage (`/group/demo-1`, `/group/demo-3`, …).
 *
 * Access requires a signed, expiring Homepage pass (cookie) issued after
 * wristband/ticket QR redeem. URL alone is not access control.
 * No Register CTA. No public Scan / QR scanner UI.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return Object.keys(DEMO_GROUPS).map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const group = getDemoGroup(id);
  if (!group) return { title: "Group — Vortexa" };
  return {
    title: `${group.name} · Group ${group.number}`,
    description: `Group Homepage for ${group.name}.`,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07060b",
};

export default async function GroupDemoPage({ params }: Props) {
  const { id } = await params;

  // Defense in depth: middleware already checked HMAC+expiry+gid; here we
  // enforce rotate/revoke against the Node store.
  const jar = await cookies();
  const token = jar.get(GROUP_PASS_COOKIE)?.value;
  const verified = await verifyGroupPassToken(token);
  if (!verified.ok) {
    redirect(
      `/group-pass/denied?reason=${encodeURIComponent(verified.reason)}&g=${encodeURIComponent(id)}`
    );
  }
  if (verified.pass.g !== id) {
    redirect(
      `/group-pass/denied?reason=wrong_group&g=${encodeURIComponent(id)}`
    );
  }
  const currency = isGroupPassCurrent(verified.pass);
  if (!currency.current) {
    redirect(
      `/group-pass/denied?reason=${encodeURIComponent(currency.reason)}&g=${encodeURIComponent(id)}`
    );
  }

  const group = getDemoGroup(id);
  if (!group) notFound();
  return <GroupHome group={group} />;
}
