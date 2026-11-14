/**
 * The companion streams a JSON envelope (kind, sources_used, answer).
 * While it is still arriving, this pulls out the `answer` string field and
 * decodes it, so the UI can render words as they are generated.
 *
 * Tolerant by design: missing key, incomplete escapes and malformed `\u`
 * sequences simply stop the extraction at the last fully decoded character.
 */
const KEY = /"answer"\s*:\s*"/;

const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

export function extractPartialAnswer(raw: string): string {
  const key = KEY.exec(raw);
  if (!key) return "";

  let out = "";
  for (let i = key.index + key[0].length; i < raw.length; i += 1) {
    const char = raw[i];

    if (char === '"') return out;
    if (char !== "\\") {
      out += char;
      continue;
    }

    const next = raw[i + 1];
    if (next === undefined) break; // escape split across chunks

    if (next === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break; // incomplete or invalid
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }

    const decoded = ESCAPES[next];
    if (decoded === undefined) break; // unknown escape
    out += decoded;
    i += 1;
  }

  return out;
}
