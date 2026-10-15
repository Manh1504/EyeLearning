import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode, prototypeRouteRedirect } from "@/lib/demo-mode";

const PROTECTED_PREFIXES = ["/teacher", "/student", "/admin"];
const PUBLIC_ONLY = ["/account/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const prototypeRedirect = prototypeRouteRedirect(pathname);
  if (prototypeRedirect) {
    return NextResponse.redirect(new URL(prototypeRedirect, request.url));
  }

  // Chế độ demo: bỏ qua kiểm tra đăng nhập để xem thẳng mọi màn.
  if (isDemoMode()) {
    return NextResponse.next();
  }

  const hasAccess = request.cookies.has("access_token");
  const hasRefresh = request.cookies.has("refresh_token");
  const isAuthenticated = hasAccess || hasRefresh;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isPublicOnly = PUBLIC_ONLY.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/account/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublicOnly && isAuthenticated) {
    const next = request.nextUrl.searchParams.get("next");
    if (next && PROTECTED_PREFIXES.some((p) => next.startsWith(p))) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/demo/:path*", "/teacher/:path*", "/student/:path*", "/admin/:path*", "/account/login"],
};
