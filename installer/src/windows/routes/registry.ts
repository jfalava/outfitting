import { Hono } from "hono";

import { CONTENT_TYPES } from "../../constants";
import { setScriptHeaders } from "../../utils";
import { generateRegistryScript } from "../scripts/registry";

const registryRouter = new Hono();

registryRouter.get("/", (c) => {
  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(generateRegistryScript());
});

export default registryRouter;
