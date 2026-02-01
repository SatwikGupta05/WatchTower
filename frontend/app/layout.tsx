import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Based CCTV Monitoring",
  description:
    "Transform any camera into a smart security system with AI-powered threat detection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
