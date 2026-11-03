import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast, edge-safe gate: if there's no Auth.js session cookie at all, redirect straight to /login
 * with a proper 307 (a page-level redirect after streaming starts can only be a client redirect).
 * This does NOT validate the session; every protected page and API still verifies it server-side.
 */
const PROTECTED = ["/booking", "/trips", "/track", "/alerts"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (hasSession) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/booking/:path*", "/trips/:path*", "/track/:path*", "/alerts/:path*"] };
