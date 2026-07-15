import { Hono, type Context } from "hono";

import { FONT_ARCHIVE_KEY, FONT_CHECKSUM_KEY } from "./constants";
import type { InstallerEnv } from "./types";

const fontsApp = new Hono<InstallerEnv>();

function archiveHeaders(object: R2Object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/gzip");
  headers.set("Content-Disposition", 'attachment; filename="fonts.tar.gz"');
  headers.set("Cache-Control", "private, no-store");
  headers.set("ETag", object.httpEtag);
  return headers;
}

function checksumHeaders(object: R2Object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Content-Disposition", 'attachment; filename="fonts.tar.gz.sha256"');
  headers.set("Cache-Control", "private, no-store");
  headers.set("ETag", object.httpEtag);
  return headers;
}

async function getFontObject(c: Context<InstallerEnv>, key: string) {
  return c.req.method === "HEAD"
    ? c.env.PRIVATE_FONTS.head(key)
    : c.env.PRIVATE_FONTS.get(key);
}

fontsApp.on(["GET", "HEAD"], "/fonts", async (c) => {
  const object = await getFontObject(c, FONT_ARCHIVE_KEY);
  if (!object) {
    return c.text("Not found", 404);
  }

  const headers = archiveHeaders(object);
  return c.req.method === "HEAD"
    ? new Response(null, { headers })
    : new Response((object as R2ObjectBody).body, { headers });
});

fontsApp.on(["GET", "HEAD"], "/fonts/checksum", async (c) => {
  const object = await getFontObject(c, FONT_CHECKSUM_KEY);
  if (!object) {
    return c.text("Not found", 404);
  }

  const headers = checksumHeaders(object);
  return c.req.method === "HEAD"
    ? new Response(null, { headers })
    : new Response((object as R2ObjectBody).body, { headers });
});

fontsApp.all("/fonts", (c) => c.text("Method not allowed", 405, { Allow: "GET, HEAD" }));
fontsApp.all("/fonts/checksum", (c) => c.text("Method not allowed", 405, { Allow: "GET, HEAD" }));

export default fontsApp;
