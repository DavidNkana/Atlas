import { CITIES, City, DEFAULT_CITY } from "./cities";

/**
 * Day 6 — detect a city from a free-form question string.
 *
 * Algorithm:
 *   1. Lowercase + trim the question.
 *   2. Build (alias, city) pairs from every entry in CITIES, sorted by
 *      alias length DESC so the longest, most-specific alias wins on ties
 *      (so "addis ababa" beats "addis" when both are present in the
 *      table).
 *   3. For each pair, build a regex anchored with non-alphanumeric
 *      boundaries (or string start/end) and test case-insensitively.
 *      The anchor is what makes "jo" not match "joburg" — "jo" is
 *      bounded by the start of string on the left and a space on the
 *      right, but "joburg" needs the full substring.
 *   4. First match wins. If nothing matches, return DEFAULT_CITY
 *      (Johannesburg).
 *
 * Word-boundary semantics:
 *   - "Where in Sandton" → matches sandton (capital-S is fine, regex
 *     is case-insensitive).
 *   - "Sandton City" → matches sandton (alias "sandton" is a substring
 *     inside "Sandton City", surrounded by " " and end-of-string).
 *   - "jo" alone → does NOT match joburg (no word boundary after "jo").
 *   - "Looking in Joburg for a curry spot" → matches johannesburg.
 *   - "" (empty) → returns DEFAULT_CITY without throwing.
 */
export function detectCity(question: string): City {
  const q = (question ?? "").toLowerCase().trim();
  if (!q) return DEFAULT_CITY;

  // Build (alias, city) pairs and sort by alias length DESC.
  const pairs: { alias: string; city: City }[] = [];
  for (const city of CITIES) {
    for (const alias of city.aliases) {
      pairs.push({ alias: alias.toLowerCase(), city });
    }
  }
  pairs.sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, city } of pairs) {
    // Escape regex metachars in the alias so "cape town" doesn't blow up.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // (^|[^a-z0-9]) on the left, ([^a-z0-9]|$) on the right.
    // "i" flag makes it case-insensitive (defensive — the alias and
    // the question are already lowercased, but it costs nothing).
    const re = new RegExp(
      `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
      "i",
    );
    if (re.test(q)) return city;
  }
  return DEFAULT_CITY;
}
