import type { Metadata } from "next";
import { GroundPerson } from "@/components/console/GroundPerson";
import "../../../ground-reports.css";

export const metadata: Metadata = { title: "Ground · Crew member · Pedro" };

export default function GroundPersonPage() {
  return <GroundPerson />;
}
