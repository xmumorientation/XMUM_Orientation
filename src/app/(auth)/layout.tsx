// Bare wrapper: each auth page renders its own full-screen dark layout
// (AuthShell), so this layout adds no header, background or <main>.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
