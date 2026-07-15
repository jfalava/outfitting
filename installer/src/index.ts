import { Hono } from "hono";

import { ALLOWED_HOSTS } from "./constants";
import fontsApp from "./fonts";
import macosApp from "./macos";
import type { InstallerEnv } from "./types";
import windowsApp from "./windows/index";
import wslApp from "./wsl";

const app = new Hono<InstallerEnv>();

// Domain validation middleware
app.use("*", async (c, next) => {
  const host = c.req.header("Host") || "";
  const isAllowedHost = ALLOWED_HOSTS.some((allowedHost) => host.includes(allowedHost));

  if (!isAllowedHost) {
    return c.text("I'm a teapot", 418);
  }

  return await next();
});

// Kept ahead of the Windows profile catch-all so /fonts cannot be interpreted as a profile.
app.route("/", fontsApp);

// Domain-based routing middleware
app.use("*", async (c) => {
  const host = c.req.header("Host") || "";

  if (host.includes("win.jfa.dev")) {
    return windowsApp.fetch(c.req.raw, c.env, c.executionCtx);
  }
  if (host.includes("wsl.jfa.dev")) {
    return wslApp.fetch(c.req.raw, c.env, c.executionCtx);
  }
  if (host.includes("mac.jfa.dev")) {
    return macosApp.fetch(c.req.raw, c.env, c.executionCtx);
  }

  // This should never be reached
  return c.text("I'm a teapot", 418);
});

export default app;
