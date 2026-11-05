// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/auth/AuthShell", () => ({ AuthShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({ auth: { signInWithPassword: signIn } }) }));
import { LoginForm } from "@/app/(auth)/login/LoginForm";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("shows support only after sign-in fails", async () => {
  signIn.mockResolvedValue({ error: Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }) });
  render(<LoginForm demoLogins={[]} />);
  expect(screen.queryByRole("link", { name: "Give Feedback" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Contact Tech Team" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Campus Email"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/email or password is incorrect/i);
  expect(screen.getByRole("link", { name: "Give Feedback" }).getAttribute("href")).toBe("https://forms.gle/gcFHEWHCMzKgMcbMA");
  expect(screen.getByRole("link", { name: "Contact Tech Team" }).getAttribute("href")).toContain("wa.me/601110576001");
});
