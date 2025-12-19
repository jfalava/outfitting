import { Hono } from "hono";
import { CONTENT_TYPES, SCRIPT_URLS } from "./constants";
import { fetchScript, setScriptHeaders } from "./utils";

const wslApp = new Hono();

// Route: GET / - WSL main installation script
wslApp.get("/", async (c) => {
  console.log("WSL Script URL:", SCRIPT_URLS.wsl);

  const scriptContent = await fetchScript(SCRIPT_URLS.wsl);
  if (!scriptContent) {
    return c.text("Failed to fetch the script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.shellscript);
  return c.body(scriptContent);
});

// Route: GET /packages/bun - Bun global packages list
wslApp.get("/packages/bun", async (c) => {
  console.log("Bun Packages URL:", SCRIPT_URLS.bunPackages);

  const packagesContent = await fetchScript(SCRIPT_URLS.bunPackages);
  if (!packagesContent) {
    return c.text("Failed to fetch bun packages list", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.plaintext);
  return c.body(packagesContent);
});

export default wslApp;
