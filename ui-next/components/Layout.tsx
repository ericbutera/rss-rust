import type { ReactNode } from "react";
import Navigation from "./Navigation";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh flex flex-col bg-base-200">
      <Navigation />
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  );
}
