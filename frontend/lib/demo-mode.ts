export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO === "1";
}

export function prototypeRouteRedirect(
  pathname: string,
  isProduction = process.env.NODE_ENV === "production",
): string | null {
  if (!isProduction || isDemoMode()) return null;

  if (pathname === "/demo" || pathname.startsWith("/demo/")) return "/";
  if (
    pathname === "/student/assignments" ||
    pathname.startsWith("/student/assignments/")
  ) {
    return "/student";
  }
  if (
    pathname === "/teacher/assignments" ||
    pathname.startsWith("/teacher/assignments/")
  ) {
    return "/teacher";
  }

  return null;
}
