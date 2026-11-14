import type { Metadata } from "next";
import { CrewScreen } from "@/components/console/CrewScreen";

export const metadata: Metadata = { title: "Crew · Companion Console" };

export default function CrewPage() {
  return <CrewScreen />;
}
