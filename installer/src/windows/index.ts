import { Hono } from "hono";

import bunRouter from "./routes/bun";
import configRouter from "./routes/config";
import helpRouter from "./routes/help";
import msstoreRouter from "./routes/msstore";
import packagesRouter from "./routes/packages";
import profileRouter from "./routes/profile";
import registryRouter from "./routes/registry";

const windowsApp = new Hono();

// GET /
windowsApp.route("/", helpRouter);

// GET /config/pwsh-profile  GET /config/:file
windowsApp.route("/config", configRouter);

// GET /packages/msstore/:profile  GET /packages/:profile
// NOTE: msstore sub-route is registered first inside packagesRouter to avoid wildcard swallowing
windowsApp.route("/packages", packagesRouter);

// GET /msstore/:profile
windowsApp.route("/msstore", msstoreRouter);

// GET /bun
windowsApp.route("/bun", bunRouter);

// GET /registry
windowsApp.route("/registry", registryRouter);

// GET /:profile  (must be last — wildcard catch-all for WinGet profiles)
windowsApp.route("/", profileRouter);

export default windowsApp;
