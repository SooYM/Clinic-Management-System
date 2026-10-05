import type { Metadata } from "next";
import { CardGlow } from "../components/CardGlow";
import { Toaster } from "../components/toast";
import { SessionProvider } from "../lib/state/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kumo Clinic Management System (CMS)",
  description: "Malaysia-focused clinic operations workspace for patient registration, queues, clinical documents, inventory, and billing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <CardGlow />
        <Toaster />
      </body>
    </html>
  );
}
