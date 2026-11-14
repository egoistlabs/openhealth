import type { Metadata } from "next";
import { GroundPerson } from "@/components/console/GroundPerson";

export const metadata: Metadata = { title: "Ground · Crew member · OpenHealth" };

export default function GroundPersonPage() {
  return <GroundPerson />;
}
