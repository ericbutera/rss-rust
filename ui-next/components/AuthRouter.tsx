"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";

function RouterSync() {
  const nextRouter = useRouter();
  const location = useLocation();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    const target = `${location.pathname}${location.search}`;
    if (target === lastSyncedRef.current) {
      return;
    }
    lastSyncedRef.current = target;
    nextRouter.replace(target);
  }, [location.pathname, location.search, nextRouter]);

  return null;
}

export default function AuthRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const entry = query ? `${pathname}?${query}` : pathname;

  return (
    <MemoryRouter initialEntries={[entry]}>
      <RouterSync />
      {children}
    </MemoryRouter>
  );
}
