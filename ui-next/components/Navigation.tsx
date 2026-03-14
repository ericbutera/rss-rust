"use client";

import { auth } from "@ericbutera/kaleido";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

export default function Navigation() {
  const authApi = auth.useAuthApi();
  const { user, isLoading } = authApi.useCurrentUser();
  const logout = authApi.useLogout();

  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="navbar-start">
        <div className="dropdown">
          <div tabIndex={0} role="button" className="btn btn-ghost lg:hidden">
            <FontAwesomeIcon icon={faBars} />
          </div>
          <ul
            tabIndex={-1}
            className="menu menu-sm dropdown-content bg-base-100 rounded-box z-50 mt-3 w-52 p-2 shadow"
          >
            <li>
              <Link href="/">Home</Link>
            </li>
            {user && (
              <>
                <li>
                  <Link href="/feeds">Feeds</Link>
                </li>
                <li>
                  <Link href="/account">Account</Link>
                </li>
              </>
            )}
            {user?.is_admin && (
              <li>
                <Link href="/admin">Admin</Link>
              </li>
            )}

            {!isLoading && user ? (
              <li>
                <button
                  type="button"
                  className="btn btn-ghost w-full text-left"
                  onClick={() => logout.mutateAsync()}
                  disabled={logout.isPending}
                >
                  {logout.isPending ? "Signing out..." : "Sign out"}
                </button>
              </li>
            ) : (
              <>
                <li>
                  <Link href="/login">Login</Link>
                </li>
                <li>
                  <Link href="/signup">Sign up</Link>
                </li>
              </>
            )}
          </ul>
        </div>

        <Link href="/" className="btn btn-ghost text-xl normal-case">
          rss
        </Link>
      </div>

      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          <li>
            <Link href="/">Home</Link>
          </li>
          {user && (
            <>
              <li>
                <Link href="/feeds">Feeds</Link>
              </li>
              <li>
                <Link href="/account">Account</Link>
              </li>
            </>
          )}
          {user?.is_admin && (
            <li>
              <Link href="/admin">Admin</Link>
            </li>
          )}
        </ul>
      </div>

      <div className="navbar-end">
        <ul className="menu menu-horizontal px-1">
          {isLoading ? null : user ? (
            <li>
              <button
                className="btn"
                type="button"
                onClick={() => logout.mutateAsync()}
                disabled={logout.isPending}
              >
                {logout.isPending ? "Signing out..." : "Sign out"}
              </button>
            </li>
          ) : (
            <>
              <li>
                <Link href="/login">Login</Link>
              </li>
              <li>
                <Link href="/signup" className="btn btn-primary">
                  Sign up
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
