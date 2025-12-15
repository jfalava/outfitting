import type { Context } from "hono";
import { USER_AGENT } from "./constants";

/**
 * Sets common response headers for script delivery
 */
export function setScriptHeaders(c: Context, contentType: string) {
  c.header("Content-Type", contentType);
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");
}

/**
 * Fetches a script from a URL with common settings
 */
export async function fetchScript(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return null;
  }

  return await response.text();
}

/**
 * Helper function to fetch a config file
 */
export async function fetchConfigFile(config: { path: string; contentType: string } | undefined) {
  if (!config) {
    return null;
  }

  const response = await fetch(config.path, {
    headers: {
      Accept: "text/plain",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    return null;
  }

  return {
    content: await response.text(),
    contentType: config.contentType,
  };
}

/**
 * Fetches and combines multiple package list files
 */
export async function fetchPackageLists(urls: string[]): Promise<string | null> {
  const contents: string[] = [];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        Accept: "text/plain",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`Failed to fetch package list: ${url}`);
      return null;
    }

    const text = await response.text();
    // Filter out comments and empty lines, then add to contents
    const filteredLines = text
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .join("\n");

    if (filteredLines.trim()) {
      contents.push(filteredLines);
    }
  }

  return contents.join("\n");
}
