import { Hono } from "hono";
import { ALLOWED_HOSTS } from "./constants";
import macosApp from "./macos";
import windowsApp from "./windows";
import wslApp from "./wsl";

const app = new Hono();

// Domain validation middleware
app.use("*", async (c, next) => {
  const host = c.req.header("Host") || "";
  const isAllowedHost = ALLOWED_HOSTS.some((allowedHost) =>
    host.includes(allowedHost),
  );

  if (!isAllowedHost) {
    return c.text("I'm a teapot", 418);
  }

  await next();
});

// Domain-based routing middleware
app.use("*", async (c) => {
  const host = c.req.header("Host") || "";

  if (host.includes("win.jfa.dev")) {
    return windowsApp.fetch(c.req.raw);
  }
  if (host.includes("wsl.jfa.dev")) {
    return wslApp.fetch(c.req.raw);
  }
  if (host.includes("mac.jfa.dev")) {
    return macosApp.fetch(c.req.raw);
  }

  // This should never be reached due to the validation middleware,
  // but keep as a safety fallback
  return c.text("I'm a teapot", 418);
});

export default app;
