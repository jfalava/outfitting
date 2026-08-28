import { Hono } from "hono";

import { CONTENT_TYPES, SCRIPT_URLS } from "./constants";
import { fetchScript, setScriptHeaders } from "./utils";

const nixosApp = new Hono();

// Route: GET / - NixOS main installation script
nixosApp.get("/", async (c) => {
  console.warn("NixOS Script URL:", SCRIPT_URLS.nixos);

  const scriptContent = await fetchScript(SCRIPT_URLS.nixos);
  if (!scriptContent) {
    return c.text("Failed to fetch the script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.shellscript);
  return c.body(scriptContent);
});

export default nixosApp;
