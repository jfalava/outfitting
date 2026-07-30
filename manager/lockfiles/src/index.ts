import { Hono } from "hono";

import { registerDeleteLockfileRoute } from "./routes/delete-lockfile";
import { registerGetLockfileRoute } from "./routes/get-lockfile";
import { registerGetLockfileHistoryRoute } from "./routes/get-lockfile-history";
import { registerListLockfilesRoute } from "./routes/list-lockfiles";
import { registerPutLockfileRoute } from "./routes/put-lockfile";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const token = await c.env.OUTFITTING_LOCKFILES_TOKEN.get();
  const authorization = c.req.header("Authorization");

  if (!token || authorization !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

registerPutLockfileRoute(app);
registerGetLockfileHistoryRoute(app);
registerGetLockfileRoute(app);
registerListLockfilesRoute(app);
registerDeleteLockfileRoute(app);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  console.error(error);
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
