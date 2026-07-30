import { timingSafeEqual } from "node:crypto";

import { Hono } from "hono";

import { registerLockfileRoutes, type AppEnv } from "./routes";

const app = new Hono<AppEnv>();

function tokensMatch(authorization: string | undefined, token: string): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return false;
  }

  const encoder = new TextEncoder();
  const supplied = encoder.encode(authorization.slice(prefix.length));
  const expected = encoder.encode(token);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

app.use("*", async (c, next) => {
  const token = await c.env.OUTFITTING_LOCKFILES_TOKEN.get();
  const authorization = c.req.header("Authorization");

  if (!token || !tokensMatch(authorization, token)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

registerLockfileRoutes(app);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      message: "Unhandled lockfiles Worker error",
      error: error.message,
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
});

export {
  ADVANCE_HEAD_SQL,
  lockfileKey,
  parseIfMatch,
  PROMOTE_HISTORY_SQL,
  sha256,
} from "./lockfiles";
export { app };
export default app;
