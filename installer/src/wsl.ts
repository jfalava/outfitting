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

export default wslApp;
