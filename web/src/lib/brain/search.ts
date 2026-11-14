import type { BrainDocument, ScoredDocument } from "./types.ts";

const STOP_WORDS = new Set([
  "a", "about", "am", "an", "and", "are", "can", "do", "does", "for", "from",
  "get", "give", "help", "how", "i", "if", "in", "is", "it", "me", "my",
  "of", "on", "or", "should", "tell", "that", "the", "this", "to", "what",
  "when", "with", "you", "your",
]);

function tokens(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/s$/, ""))
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  )];
}

export function searchBrain(
  question: string,
  documents: BrainDocument[],
  limit = 3,
): ScoredDocument[] {
  const queryTokens = tokens(question);
  if (queryTokens.length === 0) return [];

  const scored = documents.map((document) => {
    const titleTokens = tokens(document.title);
    const keywordTokens = tokens(document.keywords.join(" "));
    const topicTokens = tokens(document.topic);
    const bodyTokens = new Set(tokens(document.body));
    const titleSet = new Set(titleTokens);
    const keywordSet = new Set(keywordTokens);
    let score = 0;

    for (const token of queryTokens) {
      if (titleSet.has(token)) score += 4;
      if (keywordSet.has(token)) score += 3;
      if (topicTokens.includes(token)) score += 2;
      if (bodyTokens.has(token)) score += 1;
    }

    return { ...document, score };
  });

  return scored
    .filter((document) => document.score >= 3)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}
