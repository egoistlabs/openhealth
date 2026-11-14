import type { Metadata } from "next";
import { GroundScreen } from "@/components/console/GroundScreen";

export const metadata: Metadata = { title: "Ground · OpenHealth" };

export default function GroundPage() {
  return <GroundScreen />;
}
