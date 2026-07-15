import { Hono } from "hono";

import { CONTENT_TYPES } from "../../constants";
import { sanitizeHost, setScriptHeaders } from "../../utils";
import { generateHelpScript } from "../scripts/help";

const helpRouter = new Hono();

helpRouter.get("/", (c) => {
  const host = sanitizeHost(c.req.header("Host") || "win.jfa.dev");
  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(generateHelpScript(host));
});

export default helpRouter;
