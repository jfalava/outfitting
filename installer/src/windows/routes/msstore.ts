import { Hono } from "hono";

import { CONTENT_TYPES, MSSTORE_PACKAGE_PROFILES } from "../../constants";
import { setScriptHeaders } from "../../utils";
import { generateMsstoreErrorScript, generateMsstoreScript } from "../scripts/msstore";

const msstoreRouter = new Hono();

// GET /msstore/:profile - Install Microsoft Store packages
msstoreRouter.get("/:profile", (c) => {
  const profileParam = c.req.param("profile");
  const host = c.req.header("Host") || "win.jfa.dev";

  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  const invalidProfiles = requestedProfiles.filter(
    (p) => !MSSTORE_PACKAGE_PROFILES.some((profile) => profile === p),
  );

  if (invalidProfiles.length > 0) {
    setScriptHeaders(c, CONTENT_TYPES.powershell);
    return c.body(generateMsstoreErrorScript(host, invalidProfiles, MSSTORE_PACKAGE_PROFILES), 400);
  }

  console.warn(
    `Serving Microsoft Store installation script for profiles: ${requestedProfiles.join(", ")}`,
  );

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(generateMsstoreScript(host, profileParam));
});

export default msstoreRouter;
