import type { Metadata } from "next";
import { GroundReports } from "@/components/console/GroundReports";
import "../../../ground-reports.css";

export const metadata: Metadata = { title: "Ground · Pedro reports · Pedro" };

export default function GroundReportsPage() {
  return <GroundReports />;
}
