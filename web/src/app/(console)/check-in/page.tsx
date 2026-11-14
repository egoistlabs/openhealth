import type { Metadata } from "next";
import { CheckinScreen } from "@/components/console/CheckinScreen";

export const metadata: Metadata = { title: "Check-in · Companion Console" };

/* ?step=mood opens the check-in on that question (used by "Correct" in the companion log). */
export default async function CheckinPage({ searchParams }: PageProps<"/check-in">) {
  const { step } = await searchParams;
  return <CheckinScreen key={typeof step === "string" ? step : "start"} step={typeof step === "string" ? step : undefined} />;
}
