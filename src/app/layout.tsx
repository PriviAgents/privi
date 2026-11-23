import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Privi — private spending, agent-executed",
    template: "%s · Privi",
  },
  description:
    "Hold SOL and USDC in a Helius Privacy Ring with an encrypted balance, and let an agent book flights, hotels, and everyday purchases through chat.",
  applicationName: "Privi",
  // Home screen app on iPhone: opens full screen, titled "Privi".
  appleWebApp: { capable: true, title: "Privi", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  // Draw under the notch and home indicator; layouts pad with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GridBackdrop />
        <div className="privi-grain" aria-hidden />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
