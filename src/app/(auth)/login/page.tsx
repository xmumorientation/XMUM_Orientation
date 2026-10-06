import { Suspense } from "react";

import { getDemoLogins } from "./demo-logins";
import { LoginForm } from "./LoginForm";

// Server wrapper so the demo login passwords stay on the server. On
// production the list is empty and nothing about it reaches the browser.
export default function LoginPage() {
  const demoLogins = getDemoLogins();
  return (
    <Suspense>
      <LoginForm demoLogins={demoLogins} />
    </Suspense>
  );
}
