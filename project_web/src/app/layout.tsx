import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yadut // ARCUS CORE",
  description: "ARCUS command console for the Yadut assistant system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
