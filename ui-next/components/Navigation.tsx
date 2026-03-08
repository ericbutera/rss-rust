"use client";

import { auth } from "@ericbutera/kaleido";
import Link from "next/link";

export default function Navigation() {
  const authApi = auth.useAuthApi();
  const { user, isLoading } = authApi.useCurrentUser();
  const logout = authApi.useLogout();

  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="flex-1">
        <Link href="/" className="btn btn-ghost normal-case text-lg">
          rss
        </Link>
        {user && (
          <Link href="/feeds" className="ml-4 hidden sm:inline">
            Feeds
          </Link>
        )}
        <Link href="/account" className="ml-4 hidden sm:inline">
          Account
        </Link>
        {user?.is_admin && (
          <Link href="/admin" className="btn btn-ghost ml-2 hidden sm:inline">
            Admin
          </Link>
        )}
      </div>
      <div className="flex-none">
        {isLoading ? null : user ? (
          <button
            type="button"
            onClick={() => logout.mutateAsync()}
            disabled={logout.isPending}
            className="btn btn-ghost"
          >
            {logout.isPending ? "Signing out..." : "Sign out"}
          </button>
        ) : (
          <div className="space-x-2">
            <Link href="/login" className="btn btn-ghost">
              Login
            </Link>
            <Link href="/signup" className="btn btn-primary">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
