import { Hono } from "hono";

import { CONFIG_FILES, CONTENT_TYPES } from "../../constants";
import { fetchConfigFile, setScriptHeaders } from "../../utils";
import { generatePwshProfileScript } from "../scripts/pwsh-profile";

const configRouter = new Hono();

// GET /config/pwsh-profile - PowerShell profile update script
configRouter.get("/pwsh-profile", (c) => {
  const host = c.req.header("Host") || "";
  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(generatePwshProfileScript(host));
});

// GET /config/:file - Fetch individual config files from GitHub
configRouter.get("/:file", async (c) => {
  const fileKey = c.req.param("file");

  if (!CONFIG_FILES[fileKey]) {
    return c.json({ error: "Invalid config file", available: Object.keys(CONFIG_FILES) }, 400);
  }

  console.warn(`Fetching config file: ${fileKey}`);

  const result = await fetchConfigFile(CONFIG_FILES[fileKey]);
  if (!result) {
    return c.text(`Failed to fetch config file: ${fileKey}`, 500);
  }

  setScriptHeaders(c, result.contentType);
  return c.body(result.content);
});

export default configRouter;
