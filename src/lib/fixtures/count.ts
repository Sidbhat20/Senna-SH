/** Real (non-bye) matches a format needs for n entries; groups+knockout sends the top two of each group through. */
export function matchCount(format: "knockout" | "league" | "groups_knockout" | "double_elim", n: number, groupCount: number) {
  if (n < 2) return 0;
  if (format === "knockout") return n - 1; // every match knocks out exactly one entry
  if (format === "league") return (n * (n - 1)) / 2;
  // each match is one loss; n-2 entries go out with 2, champion + runner-up share 2 (no bracket reset)
  if (format === "double_elim") return 2 * n - 2;
  const g = Math.min(groupCount, Math.floor(n / 2));
  const sizes = Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0));
  return sizes.reduce((s, k) => s + (k * (k - 1)) / 2, 0) + (2 * g - 1);
}
