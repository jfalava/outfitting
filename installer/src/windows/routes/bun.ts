import { Hono } from "hono";

import { CONTENT_TYPES } from "../../constants";
import { setScriptHeaders } from "../../utils";
import { generateBunScript } from "../scripts/bun";

const bunRouter = new Hono();

bunRouter.get("/", (c) => {
  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(generateBunScript());
});

export default bunRouter;
