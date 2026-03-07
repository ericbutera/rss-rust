import type { ReactNode } from "react";
import Navigation from "./Navigation";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-base-200">
      <Navigation />
      <main className="col-span-12 md:col-span-9">{children}</main>
    </div>
  );
}
