import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "../lib/AuthProvider";
import { PlayerDeck } from "../components/PlayerDeck";
import { MaintenanceScreen } from "../components/MaintenanceScreen";
import { ToastContainer } from "../components/ToastContainer";
import { ImpersonationBanner } from "../components/ImpersonationBanner";
import { AnnouncementBanner } from "../components/AnnouncementBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Peyma Music",
  description: "Tu música, sin límites.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>
          <ImpersonationBanner />
          <AnnouncementBanner />
          {children}
          <PlayerDeck />
          <MaintenanceScreen />
          <ToastContainer />
        </AuthProvider>
      </body>
    </html>
  );
}
