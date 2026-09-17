import { Hono } from "hono";

import helpRouter from "./routes/help";
import postInstallRouter from "./routes/post-install";
import profileRouter from "./routes/profile";
import registryRouter from "./routes/registry";

const windowsApp = new Hono();

// GET /
windowsApp.route("/", helpRouter);

// GET /registry
windowsApp.route("/registry", registryRouter);

// GET /post-install (must precede the profile catch-all)
windowsApp.route("/post-install", postInstallRouter);

// GET /:profile  (must be last — wildcard catch-all for WinGet profiles)
windowsApp.route("/", profileRouter);

export default windowsApp;
