import type { Metadata } from "next";
import { CompanionScreen } from "@/components/console/CompanionScreen";

export const metadata: Metadata = { title: "Pedro · OpenHealth" };

export default function CompanionPage() {
  return <CompanionScreen />;
}
