import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveBrainRoot } from "./root.ts";

type RedFlagConfiguration = {
  escalation_message: string;
  categories: Array<{ id: string; terms: string[] }>;
};

export async function checkRedFlags(
  message: string,
): Promise<{ matched: boolean; categories: string[]; escalationMessage: string }> {
  const configuration = JSON.parse(
    await readFile(
      path.join(resolveBrainRoot(), "safety", "red-flags.json"),
      "utf8",
    ),
  ) as RedFlagConfiguration;
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, " ");
  const categories = configuration.categories
    .filter((category) =>
      category.terms.some((term) => normalizedMessage.includes(term.toLowerCase())),
    )
    .map((category) => category.id);

  return {
    matched: categories.length > 0,
    categories,
    escalationMessage: configuration.escalation_message,
  };
}
