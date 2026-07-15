import { Hono } from "hono";

import { CONTENT_TYPES, SCRIPT_URLS, WINDOWS_PACKAGE_PROFILES } from "../../constants";
import { fetchScript, sanitizeHost, setScriptHeaders } from "../../utils";
import { generateProfileErrorScript } from "../scripts/profile";

const profileRouter = new Hono();

// GET /:profile - WinGet install script with injected profile URL (supports "base+dev+gaming")
profileRouter.get("/:profile", async (c) => {
  const profileParam = c.req.param("profile");
  const host = sanitizeHost(c.req.header("Host") || "win.jfa.dev");

  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  const invalidProfiles = requestedProfiles.filter(
    (p) => !WINDOWS_PACKAGE_PROFILES.some((profile) => profile === p),
  );

  if (invalidProfiles.length > 0) {
    setScriptHeaders(c, CONTENT_TYPES.powershell);
    return c.body(generateProfileErrorScript(host, invalidProfiles, WINDOWS_PACKAGE_PROFILES), 400);
  }

  console.warn(`Serving installation script for profiles: ${requestedProfiles.join(", ")}`);

  const baseScript = await fetchScript(SCRIPT_URLS.windows);
  if (!baseScript) {
    return c.text("Failed to fetch the base script", 500);
  }

  // Inject the requested profile URL into the base script
  const originalMarker = '$wingetPackagesUrl = "https://win.jfa.dev/packages/base"';
  const replacementURL = `$wingetPackagesUrl = "https://${host}/packages/${requestedProfiles.join("+")}"`;
  const modifiedScript = baseScript.replace(originalMarker, replacementURL);

  if (!modifiedScript.includes(replacementURL)) {
    console.error("URL replacement failed!");
    console.error(`Original marker: ${originalMarker}`);
    console.error(`Replacement URL: ${replacementURL}`);
    console.error(
      `Script snippet around expected location:\n${baseScript.substring(baseScript.indexOf("wingetPackagesUrl") - 50, baseScript.indexOf("wingetPackagesUrl") + 150)}`,
    );
    return c.text(
      "Internal error: Failed to inject profile URL. The base script format may have changed. Please file an issue in https://github.com/jfalava/outfitting/issues",
      500,
    );
  }

  setScriptHeaders(c, CONTENT_TYPES.powershell);
  return c.body(modifiedScript);
});

export default profileRouter;
