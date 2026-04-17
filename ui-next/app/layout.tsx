import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "../components/Providers";
import RuntimeConfigScript from "../components/RuntimeConfigScript";
import { getServerConfig } from "../lib/config";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "rss",
  description: "Next.js frontend scaffold",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const config = getServerConfig();

  return (
    <html lang="en">
      <body>
        <RuntimeConfigScript config={config} />
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  );
}
