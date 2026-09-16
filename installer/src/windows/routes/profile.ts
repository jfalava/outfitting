import { Hono } from "hono";

import { CONTENT_TYPES, SCRIPT_URLS } from "../../constants";
import { fetchScript, isSafeProfileName, sanitizeHost, setScriptHeaders } from "../../utils";
import { generateProfileErrorScript } from "../scripts/profile";

const profileRouter = new Hono();

// GET /:profile - CLI bootstrap script with injected desired-state profiles (supports "base+dev+gaming")
profileRouter.get("/:profile", async (c) => {
  const profileParam = c.req.param("profile");
  const host = sanitizeHost(c.req.header("Host") || "win.jfa.dev");

  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  const invalidProfiles = requestedProfiles.filter((profile) => !isSafeProfileName(profile));

  if (invalidProfiles.length > 0) {
    setScriptHeaders(c, CONTENT_TYPES.powershell);
    return c.body(generateProfileErrorScript(host, invalidProfiles), 400);
  }

  console.warn(`Serving installation script for profiles: ${requestedProfiles.join(", ")}`);

  const baseScript = await fetchScript(SCRIPT_URLS.windows);
  if (!baseScript) {
    return c.text("Failed to fetch the base script", 500);
  }

  // Inject the requested profiles into the shared CLI bootstrap script.
  const originalMarker = '$outfittingInitialProfiles = @("base")';
  const replacement = `$outfittingInitialProfiles = @(${requestedProfiles.map((profile) => `"${profile}"`).join(", ")})`;
  const modifiedScript = baseScript.replace(originalMarker, replacement);

  if (!modifiedScript.includes(replacement)) {
    console.error("Profile replacement failed!");
    console.error(`Original marker: ${originalMarker}`);
    console.error(`Replacement profiles: ${replacement}`);
    console.error(
      `Script snippet around expected location:\n${baseScript.substring(baseScript.indexOf("outfittingInitialProfiles") - 50, baseScript.indexOf("outfittingInitialProfiles") + 150)}`,
    );
    return c.text(
      "Internal error: Failed to inject profiles. The base script format may have changed. Please file an issue in https://github.com/jfalava/outfitting/issues",
      500,
    );
  }

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(modifiedScript);
});

export default profileRouter;
