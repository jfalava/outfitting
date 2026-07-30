import { isNewerVersion } from "@/upgrade/version";

const RELEASES_URL = "https://api.github.com/repos/jfalava/outfitting/releases?per_page=30";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
  assets: GitHubAsset[];
}

export interface CliRelease {
  version: string;
  binaryUrl: string;
  checksumUrl: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function isRelease(value: unknown): value is GitHubRelease {
  if (!value || typeof value !== "object") {
    return false;
  }
  const release = value as Partial<GitHubRelease>;
  return (
    typeof release.draft === "boolean" &&
    typeof release.prerelease === "boolean" &&
    typeof release.tag_name === "string" &&
    Array.isArray(release.assets)
  );
}

export async function latestCliRelease(
  assetName: string,
  fetcher: Fetcher = fetch,
): Promise<CliRelease> {
  const response = await fetcher(RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "outfitting-manager",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub release check failed with HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error("GitHub returned an invalid releases response.");
  }

  const releases = body
    .filter(isRelease)
    .filter(
      (candidate) =>
        !candidate.draft &&
        !candidate.prerelease &&
        /^cli-v\d+\.\d+\.\d+$/.test(candidate.tag_name),
    );
  const release = releases.reduce<GitHubRelease | undefined>(
    (newest, candidate) =>
      !newest || isNewerVersion(candidate.tag_name, newest.tag_name) ? candidate : newest,
    undefined,
  );
  if (!release) {
    throw new Error("No stable outfitting-manager CLI release was found.");
  }

  const binary = release.assets.find((asset) => asset.name === assetName);
  const checksum = release.assets.find((asset) => asset.name === `${assetName}.sha256`);
  if (!binary || !checksum) {
    throw new Error(`Release ${release.tag_name} does not contain ${assetName} and its checksum.`);
  }

  return {
    version: release.tag_name.slice("cli-v".length),
    binaryUrl: binary.browser_download_url,
    checksumUrl: checksum.browser_download_url,
  };
}
