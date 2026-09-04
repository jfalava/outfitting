import { Option, Schema } from "effect";

import { isNewerVersion } from "@/upgrade/version";

const RELEASES_URL = "https://api.github.com/repos/jfalava/outfitting/releases?per_page=30";

const GitHubAssetSchema = Schema.Struct({
  name: Schema.String,
  browser_download_url: Schema.String,
});

const GitHubReleaseSchema = Schema.Struct({
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  tag_name: Schema.String,
  assets: Schema.Array(GitHubAssetSchema),
});

type GitHubRelease = Schema.Schema.Type<typeof GitHubReleaseSchema>;
type GitHubAsset = Schema.Schema.Type<typeof GitHubAssetSchema>;
interface SelectedReleaseAsset {
  asset: GitHubAsset;
  checksum: GitHubAsset;
  format: "binary" | "zip";
}

const ReleaseListSchema = Schema.Array(Schema.Unknown);
const decodeReleaseList = Schema.decodeUnknownOption(ReleaseListSchema);
const decodeGitHubRelease = Schema.decodeUnknownOption(GitHubReleaseSchema);

export interface CliRelease {
  version: string;
  assetUrl: string;
  checksumUrl: string;
  format: "binary" | "zip";
  executableName: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function selectReleaseAsset(
  release: GitHubRelease,
  assetName: string,
): SelectedReleaseAsset | undefined {
  const archive = release.assets.find((asset) => asset.name === assetName);
  if (archive) {
    const checksum = release.assets.find((asset) => asset.name === `${archive.name}.sha256`);
    if (checksum) {
      return { asset: archive, checksum, format: "zip" };
    }
  }

  if (!assetName.endsWith(".zip")) {
    return undefined;
  }
  const legacyName = assetName.slice(0, -4);
  const legacyBinary = release.assets.find((asset) => asset.name === legacyName);
  const legacyChecksum = release.assets.find((asset) => asset.name === `${legacyName}.sha256`);
  return legacyBinary && legacyChecksum
    ? { asset: legacyBinary, checksum: legacyChecksum, format: "binary" }
    : undefined;
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

  const body = decodeReleaseList(await response.json());
  if (Option.isNone(body)) {
    throw new Error("GitHub returned an invalid releases response.");
  }

  const releases = body.value.flatMap((candidate) => {
    const decoded = decodeGitHubRelease(candidate);
    if (Option.isNone(decoded)) {
      return [];
    }
    return [decoded.value];
  });
  const stableReleases = releases.filter(
    (candidate) =>
      !candidate.draft && !candidate.prerelease && /^cli-v\d+\.\d+\.\d+$/.test(candidate.tag_name),
  );
  const release = stableReleases.reduce<GitHubRelease | undefined>(
    (newest, candidate) =>
      !newest || isNewerVersion(candidate.tag_name, newest.tag_name) ? candidate : newest,
    undefined,
  );
  if (!release) {
    throw new Error("No stable outfitting-manager CLI release was found.");
  }

  const selected = selectReleaseAsset(release, assetName);
  if (!selected) {
    throw new Error(`Release ${release.tag_name} does not contain ${assetName} and its checksum.`);
  }

  return {
    version: release.tag_name.slice("cli-v".length),
    assetUrl: selected.asset.browser_download_url,
    checksumUrl: selected.checksum.browser_download_url,
    format: selected.format,
    executableName: assetName.endsWith(".zip") ? assetName.slice(0, -4) : assetName,
  };
}
