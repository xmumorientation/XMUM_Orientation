/** Keep sign-in errors useful without exposing provider internals. */
export function loginError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Email or password is incorrect. Check both and try again.";
  }
  if (code === "email_not_confirmed") return "Your email is not confirmed yet. Check your inbox for the confirmation link.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many attempts. Wait a moment and try again.";
  return "Could not sign in. Check your connection and try again.";
}
