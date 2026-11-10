// Strict number parsing for user input. Never substitutes a default for bad input.

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'not-a-number' };

/**
 * Accepts: "4", "4.5", ".5", "3 1/2", "1/2". Rejects everything else,
 * including thousands separators and decimal commas (ambiguous across regions).
 */
export function parseNumber(raw: string): ParseResult {
  const s = raw.trim();
  if (s === '') return { ok: false, reason: 'empty' };
  let m = /^(\d+(?:\.\d*)?|\.\d+)$/.exec(s);
  if (m) return { ok: true, value: Number(s) };
  m = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const whole = m[1] ? Number(m[1]) : 0;
    const den = Number(m[3]);
    if (den === 0) return { ok: false, reason: 'not-a-number' };
    return { ok: true, value: whole + Number(m[2]) / den };
  }
  return { ok: false, reason: 'not-a-number' };
}
