import { Hono } from "hono";

import { CONTENT_TYPES, SCRIPT_URLS } from "./constants";
import { fetchScript, setScriptHeaders } from "./utils";

const linuxApp = new Hono();

// Route: GET / - generic Linux binary bootstrap
linuxApp.get("/", async (c) => {
  console.warn("Linux Script URL:", SCRIPT_URLS.linux);

  const scriptContent = await fetchScript(SCRIPT_URLS.linux);
  if (!scriptContent) {
    return c.text("Failed to fetch the script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.shellscript);
  return c.body(scriptContent);
});

export default linuxApp;
