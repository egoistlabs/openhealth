import type { Metadata } from "next";
import { GroundPerson } from "@/components/console/GroundPerson";

export const metadata: Metadata = { title: "Ground · Crew member · Companion Console" };

export default function GroundPersonPage() {
  return <GroundPerson />;
}
