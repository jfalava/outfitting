import { Hono } from "hono";

import {
  CONTENT_TYPES,
  MSSTORE_PACKAGE_PROFILES,
  WINDOWS_PACKAGES_BASE,
  WINDOWS_PACKAGE_PROFILES,
} from "../../constants";
import { setScriptHeaders } from "../../utils";

const packagesRouter = new Hono();

// Route: GET /packages/msstore/:profile - Fetch Microsoft Store package lists (supports composition)
// NOTE: This route must be registered before /packages/:profile to avoid /:profile swallowing "msstore"
packagesRouter.get("/msstore/:profile", async (c) => {
  const profileParam = c.req.param("profile");

  // Split by '+' to support compound profiles (e.g., "msstore-base+msstore-gaming")
  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  // Validate all requested profiles
  const invalidProfiles = requestedProfiles.filter(
    (p) => !MSSTORE_PACKAGE_PROFILES.some((profile) => profile === p),
  );

  if (invalidProfiles.length > 0) {
    return c.json(
      {
        error: "Invalid Microsoft Store profile(s)",
        invalid: invalidProfiles,
        available: MSSTORE_PACKAGE_PROFILES,
      },
      400,
    );
  }

  console.warn(`Fetching Microsoft Store packages for profiles: ${requestedProfiles.join(", ")}`);

  // Fetch all requested package files
  const packageContents: string[] = [];

  for (const profile of requestedProfiles) {
    const url = `${WINDOWS_PACKAGES_BASE}/${profile}.txt`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${profile}.txt: ${response.status}`);
        return c.text(`Failed to fetch package list for profile: ${profile}`, 500);
      }

      const content = await response.text();
      packageContents.push(`# Microsoft Store packages from ${profile} profile\n${content}`);
    } catch (error) {
      console.error(`Error fetching ${profile}.txt:`, error);
      return c.text(`Error fetching package list for profile: ${profile}`, 500);
    }
  }

  const combinedPackages = packageContents.join("\n\n");

  setScriptHeaders(c, CONTENT_TYPES.plaintext);
  return c.body(combinedPackages);
});

// Route: GET /packages/:profile - Fetch Windows package lists (supports composition like "base+dev+gaming")
packagesRouter.get("/:profile", async (c) => {
  const profileParam = c.req.param("profile");

  // Split by '+' to support compound profiles (e.g., "base+dev+gaming")
  const requestedProfiles = profileParam.split("+").map((p) => p.trim().toLowerCase());

  // Validate all requested profiles
  const invalidProfiles = requestedProfiles.filter(
    (p) => !WINDOWS_PACKAGE_PROFILES.some((profile) => profile === p),
  );

  if (invalidProfiles.length > 0) {
    return c.json(
      {
        error: "Invalid profile(s)",
        invalid: invalidProfiles,
        available: WINDOWS_PACKAGE_PROFILES,
      },
      400,
    );
  }

  console.warn(`Fetching Windows packages for profiles: ${requestedProfiles.join(", ")}`);

  // Fetch all requested package files
  const packageContents: string[] = [];

  for (const profile of requestedProfiles) {
    const url = `${WINDOWS_PACKAGES_BASE}/${profile}.txt`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${profile}.txt: ${response.status}`);
        return c.text(`Failed to fetch package list for profile: ${profile}`, 500);
      }

      const content = await response.text();
      packageContents.push(`# Packages from ${profile} profile\n${content}`);
    } catch (error) {
      console.error(`Error fetching ${profile}.txt:`, error);
      return c.text(`Error fetching package list for profile: ${profile}`, 500);
    }
  }

  const combinedPackages = packageContents.join("\n\n");

  setScriptHeaders(c, CONTENT_TYPES.plaintext);
  return c.body(combinedPackages);
});

export default packagesRouter;
