const STOP_TOKENS = new Set([
  "that", "this", "with", "from", "have", "been", "they", "them", "their",
  "someone", "does", "into", "which", "what", "when", "where", "will",
]);

export function numbersIn(text: string): Set<string> {
  return new Set(text.match(/-?\d+(?:\.\d+)?/g) ?? []);
}

export function significantTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 4 && !STOP_TOKENS.has(token)) ?? []
  );
}

export function sentencesIn(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * A 4B model paraphrases, so a phrase counts as present when it appears
 * verbatim or when at least half of its significant words appear.
 */
export function mentionsSubstance(text: string, phrase: string): boolean {
  const normalizedText = text.toLowerCase();
  if (normalizedText.includes(phrase.toLowerCase())) return true;

  const phraseTokens = significantTokens(phrase);
  if (phraseTokens.length === 0) return false;
  const textTokens = new Set(significantTokens(text));
  const hits = phraseTokens.filter((token) => textTokens.has(token)).length;
  return hits / phraseTokens.length >= 0.5;
}
