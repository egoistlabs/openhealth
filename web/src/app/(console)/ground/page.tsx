import type { Metadata } from "next";
import { GroundScreen } from "@/components/console/GroundScreen";

export const metadata: Metadata = { title: "Ground · Pedro" };

export default function GroundPage() {
  return <GroundScreen />;
}
