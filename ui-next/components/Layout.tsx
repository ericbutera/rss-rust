import type { ReactNode } from "react";
import Navigation from "./Navigation";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:h-dvh flex flex-col bg-base-200">
      <Navigation />
      <main className="flex-1 min-h-0 pt-16 lg:pt-0 lg:overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
