import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "../components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "rss",
  description: "Next.js frontend scaffold",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
