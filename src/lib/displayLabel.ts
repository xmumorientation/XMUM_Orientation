/** Formats legacy database labels without changing stored content. */
export function displayLabel(value: string): string {
  return value.replace(/\s*\u00b7\s*/g, " / ");
}
