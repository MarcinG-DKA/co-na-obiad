export const PREFIX_PROTECTED_ROUTES = ["/join", "/pantry", "/recipes"] as const;

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isProtectedPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/" || path === "") {
    return true;
  }
  return PREFIX_PROTECTED_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

export function shouldRedirectUnauthenticated(pathname: string, user: unknown): boolean {
  return isProtectedPath(pathname) && user == null;
}
