import type { Metadata } from "next";
import { GroundEscalations } from "@/components/console/GroundEscalations";

export const metadata: Metadata = { title: "Ground · Escalations · Pedro" };

export default function GroundEscalationsPage() {
  return <GroundEscalations />;
}
