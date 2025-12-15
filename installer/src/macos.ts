import { Hono } from "hono";
import { CONTENT_TYPES, SCRIPT_URLS } from "./constants";
import { fetchScript, setScriptHeaders } from "./utils";

const macosApp = new Hono();

// Route: GET / - macOS main installation script
macosApp.get("/", async (c) => {
  console.log("macOS Script URL:", SCRIPT_URLS.macos);

  const scriptContent = await fetchScript(SCRIPT_URLS.macos);
  if (!scriptContent) {
    return c.text("Failed to fetch the script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.shellscript);
  return c.body(scriptContent);
});

export default macosApp;
