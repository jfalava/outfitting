const basePrefix = import.meta.env.BASE_URL.replace(/\/$/, "");

export function withBase(href: string): string {
  if (
    !href.startsWith("/") ||
    basePrefix === "" ||
    href === basePrefix ||
    href.startsWith(`${basePrefix}/`)
  ) {
    return href;
  }

  return href === "/" ? `${basePrefix}/` : `${basePrefix}${href}`;
}
