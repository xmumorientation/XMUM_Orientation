// Random password for accounts the admin creates. Shared by the CSV import
// and the single-user routes.
export function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  // Rejection sampling: discard bytes in the biased tail so every character
  // is equally likely (chars.length does not divide 256).
  const limit = 256 - (256 % chars.length);
  let pw = "";
  while (pw.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) {
      if (b < limit) pw += chars[b % chars.length];
      if (pw.length === length) break;
    }
  }
  return pw;
}
