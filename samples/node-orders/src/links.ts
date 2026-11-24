import url from "node:url";

/** Path part of an absolute or relative link (uses the legacy url.parse API). */
export function linkPath(href: string): string {
  return url.parse(href).pathname ?? "/";
}
