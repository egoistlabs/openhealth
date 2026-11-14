import { ConsoleProvider } from "@/components/console/ConsoleProvider";
import { ConsoleShell } from "@/components/console/Shell";

/* App shell for the four screens: header, mission timeline, nav, mission log and corner orb. */
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <ConsoleProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </ConsoleProvider>
  );
}
