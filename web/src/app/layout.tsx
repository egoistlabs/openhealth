import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* Looks: console (dark, default), blueprint (navy with dots) and clinic (light).
   tokens.css points --f-sans / --f-mono at these variables. */
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pedro",
  description: "Crew wellbeing companion. Prototype running on simulated data; not a medical device.",
};

/* The saved look comes from the "cc-theme" cookie (written by ConsoleProvider's setTheme), so the server puts it
   on <html> in the first HTML: a light look never flashes dark, and no inline script is needed (React 19 warns
   about <script> rendered inside components). */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const saved = (await cookies()).get("cc-theme")?.value;
  const theme = saved === "clinic" || saved === "blueprint" ? saved : undefined;
  return (
    <html lang="en" suppressHydrationWarning data-theme={theme}
      style={theme ? { colorScheme: theme === "clinic" ? "light" : "dark" } : undefined}
      className={`${plexSans.variable} ${plexMono.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
