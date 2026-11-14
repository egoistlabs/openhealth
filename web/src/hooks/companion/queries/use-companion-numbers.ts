"use client";

import { useMemo } from "react";
import { companionNumbers } from "@/lib/console/data";
import { useConsole } from "@/components/console/ConsoleProvider";

/* The per-person numbers payload sent with every companion request (C5).
   Rev is included so the numbers recompute after a check-in is written. */
export function useCompanionNumbers() {
  const { s } = useConsole();
  const { me, sol, rev } = s;
  return useMemo(() => {
    void rev; // bump → sim data changed underneath, recompute even if me/sol did not
    return companionNumbers(me, sol);
  }, [me, sol, rev]);
}
