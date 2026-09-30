import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import GroupHome from "@/components/demo/GroupHome";
import { DEMO_GROUPS, getDemoGroup } from "@/components/demo/demo-data";

/**
 * DEMO: Group Homepage shells (`/group/demo-1`, `/group/demo-3`).
 *
 * Temporary open routes for D-day walkthrough only.
 * BEFORE PRODUCTION: replace with signed, expiring Homepage pass issued after
 * Facilitator group-QR scan. Do not treat the URL alone as access control.
 * No Register CTA. No public Scan / QR scanner UI.
 */

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
    description: `Demo group Homepage for ${group.name}.`,
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
  const group = getDemoGroup(id);
  if (!group) notFound();
  return <GroupHome group={group} />;
}
