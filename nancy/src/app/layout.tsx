import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nancy — XYZ Restaurant",
  description: "Restaurant reservation voice assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
