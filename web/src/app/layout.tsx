import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* Looks: console (dark, default), blueprint (navy with dots) and clinic (light).
   tokens.css points --f-sans / --f-mono at these variables. */
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OpenHealth",
  description: "Crew wellbeing companion. Prototype running on simulated data; not a medical device.",
};

/* Applies the saved look before first paint, so a light look never flashes dark. */
const themeScript = `try{var t=localStorage.getItem("cc-theme");if(t==="clinic"||t==="blueprint"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==="clinic"?"light":"dark"}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
