import type { ReactNode } from "react";
import Navigation from "./Navigation";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-base-200">
      <Navigation />
      <main className="flex-1">{children}</main>
    </div>
  );
}
