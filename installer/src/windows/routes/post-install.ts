import { Hono } from "hono";

import { CONTENT_TYPES, SCRIPT_URLS } from "../../constants";
import { fetchScript, setScriptHeaders } from "../../utils";

const postInstallRouter = new Hono();

// GET /post-install - Windows post-install script, including protected font installation.
postInstallRouter.get("/", async (c) => {
  const scriptContent = await fetchScript(SCRIPT_URLS.windowsPostInstall);
  if (!scriptContent) {
    return c.text("Failed to fetch the post-install script", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(scriptContent);
});

export default postInstallRouter;
