import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// The PWA's colours live in the manifest and are read back out of it here, so
// there is still exactly one place they are written down. A hex in a .tsx file
// is a bug (CLAUDE.md, Never rule 7) and public/ is not app source — an
// installed icon and a status bar are browser chrome, not components.
import manifest from "@/public/manifest.json";

// Three faces, three jobs (docs/DESIGN.md): Geist for chrome, Geist Mono for
// codes and times, Source Serif for note content. They are wired to the
// `font-sans` / `font-mono` / `font-serif` utilities in globals.css.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recalc",
  description: "A study workspace that knows when its contents have gone out of date.",
  applicationName: "Recalc",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Added to the home screen, it opens fullscreen — no Safari chrome. The
  // status bar stays opaque ("default") rather than translucent, so nothing
  // has to be padded around it.
  appleWebApp: {
    capable: true,
    title: "Recalc",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Fill the screen on a notched phone; the shell pads for the safe areas.
  viewportFit: "cover",
  // Zoom stays available. Blocking it saves a design and costs an eyesight.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: manifest.theme_color },
    { media: "(prefers-color-scheme: dark)", color: manifest.theme_color_dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
