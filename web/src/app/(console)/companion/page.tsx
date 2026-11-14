import type { Metadata } from "next";
import { CompanionScreen } from "@/components/console/CompanionScreen";

export const metadata: Metadata = { title: "Companion · Companion Console" };

export default function CompanionPage() {
  return <CompanionScreen />;
}
