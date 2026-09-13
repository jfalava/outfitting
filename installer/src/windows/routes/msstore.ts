import { Hono } from "hono";

import { CONTENT_TYPES, MSSTORE_PACKAGE_PROFILES, SCRIPT_URLS } from "../../constants";
import { fetchScript, sanitizeHost, setScriptHeaders } from "../../utils";
import { generateMsstoreErrorScript } from "../scripts/msstore";

const msstoreRouter = new Hono();

// GET /msstore/:profile - CLI bootstrap script with injected Store profiles
msstoreRouter.get("/:profile", async (c) => {
  const profileParam = c.req.param("profile");
  const host = sanitizeHost(c.req.header("Host") || "win.jfa.dev");

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

  const baseScript = await fetchScript(SCRIPT_URLS.windows);
  if (!baseScript) {
    return c.text("Failed to fetch the base script", 500);
  }

  const originalMarker = '$outfittingInitialProfiles = @("base")';
  const replacement = `$outfittingInitialProfiles = @(${requestedProfiles.map((profile) => `"${profile}"`).join(", ")})`;
  const modifiedScript = baseScript.replace(originalMarker, replacement);
  if (!modifiedScript.includes(replacement)) {
    return c.text("Internal error: Failed to inject Microsoft Store profiles.", 500);
  }

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(modifiedScript);
});

export default msstoreRouter;
