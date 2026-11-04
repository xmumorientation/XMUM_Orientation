// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Admin shell (PRD-001 AC-1, AC-2): sections, page tabs, aria-current, and the
// non-admin message.

const h = vi.hoisted(() => ({ role: "admin", pathname: "/admin" }));

vi.mock("@/components/home/fonts", () => ({ nexusBody: { variable: "nb" }, vxDisplay: { variable: "vd" } }));
vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => ({ role: h.role }) }));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));

import AdminLayout from "@/app/(app)/admin/layout";

afterEach(cleanup);

function show(pathname: string, role = "admin") {
  h.pathname = pathname;
  h.role = role;
  render(
    <AdminLayout>
      <p>page body</p>
    </AdminLayout>
  );
}

const sections = () => within(screen.getByRole("navigation", { name: "Admin sections" }));
const tabs = () => within(screen.getByRole("navigation", { name: "Admin pages" }));
const hrefOf = (el: HTMLElement) => el.getAttribute("href");

describe("Admin shell", () => {
  it("AC-1: shows the four sections, each opening its first page", () => {
    show("/admin");
    expect(hrefOf(sections().getByRole("link", { name: "Live" }))).toBe("/admin");
    expect(hrefOf(sections().getByRole("link", { name: "Freshies" }))).toBe("/admin/freshies");
    expect(hrefOf(sections().getByRole("link", { name: "Game" }))).toBe("/admin/token");
    expect(hrefOf(sections().getByRole("link", { name: "Settings" }))).toBe("/admin/users");
    expect(sections().getAllByRole("link")).toHaveLength(4);
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("AC-1: Live has Live control and Audit; the current section and page are marked", () => {
    show("/admin/audit");
    expect(tabs().getAllByRole("link").map((a) => [a.textContent, hrefOf(a)])).toEqual([
      ["Live Control", "/admin"],
      ["Audit", "/admin/audit"],
    ]);
    expect(sections().getByRole("link", { name: "Live" }).getAttribute("aria-current")).toBe("page");
    expect(sections().getByRole("link", { name: "Game" }).getAttribute("aria-current")).toBeNull();
    expect(tabs().getByRole("link", { name: "Audit" }).getAttribute("aria-current")).toBe("page");
    expect(tabs().getByRole("link", { name: "Live Control" }).getAttribute("aria-current")).toBeNull();
  });

  it("AC-1: Game has Tokens, Stations, Puzzles, Blind box, NFC and Funfair", () => {
    show("/admin/funfair");
    expect(tabs().getAllByRole("link").map((a) => [a.textContent, hrefOf(a)])).toEqual([
      ["Tokens", "/admin/token"],
      ["Stations", "/admin/stations"],
      ["Puzzles", "/admin/puzzles"],
      ["Blind Box", "/admin/blindbox"],
      ["NFC", "/admin/nfc"],
      ["Funfair", "/admin/funfair"],
    ]);
    expect(sections().getByRole("link", { name: "Game" }).getAttribute("aria-current")).toBe("page");
    expect(tabs().getByRole("link", { name: "Funfair" }).getAttribute("aria-current")).toBe("page");
  });

  it("AC-1: Settings has Users, FAQ, Home Sections and Brand", () => {
    show("/admin/brand");
    expect(tabs().getAllByRole("link").map((a) => a.textContent)).toEqual(["Users", "FAQ", "Home Sections", "Brand"]);
    expect(sections().getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
  });

  it("AC-1: Freshies is one link with no page tabs, and its sub-page keeps it current", () => {
    show("/admin/freshies/headcount");
    expect(sections().getByRole("link", { name: "Freshies" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("navigation", { name: "Admin pages" })).toBeNull();
    expect(screen.queryByRole("link", { name: /headcount/i })).toBeNull();
  });

  it("AC-2: a non-admin sees only the access message", () => {
    show("/admin", "committee");
    expect(screen.getByText("Admin access required.")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText("page body")).toBeNull();
  });
});
