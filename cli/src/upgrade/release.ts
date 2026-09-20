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
}

interface SelectedCliRelease {
  release: GitHubRelease;
  assets: SelectedReleaseAsset;
}

const ReleaseListSchema = Schema.Array(Schema.Unknown);
const decodeReleaseList = Schema.decodeUnknownOption(ReleaseListSchema);
const decodeGitHubRelease = Schema.decodeUnknownOption(GitHubReleaseSchema);

export interface CliRelease {
  version: string;
  assetUrl: string;
  checksumUrl: string;
  executableName: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function selectReleaseAsset(
  release: GitHubRelease,
  assetName: string,
): SelectedReleaseAsset | undefined {
  const archive = release.assets.find((asset) => asset.name === assetName);
  if (!archive) {
    return undefined;
  }
  const checksum = release.assets.find((asset) => asset.name === `${archive.name}.sha256`);
  return checksum ? { asset: archive, checksum } : undefined;
}

function releaseVersion(tagName: string): string {
  return tagName.replace(/^cli-/, "").replace(/^v/, "");
}

function isNewerRelease(candidate: GitHubRelease, current: GitHubRelease): boolean {
  return isNewerVersion(releaseVersion(candidate.tag_name), releaseVersion(current.tag_name));
}

function newestRelease(releases: ReadonlyArray<GitHubRelease>): GitHubRelease | undefined {
  return releases.reduce<GitHubRelease | undefined>(
    (newest, candidate) => (!newest || isNewerRelease(candidate, newest) ? candidate : newest),
    undefined,
  );
}

function newestReleaseWithAsset(
  releases: ReadonlyArray<GitHubRelease>,
  assetName: string,
): SelectedCliRelease | undefined {
  return releases.reduce<SelectedCliRelease | undefined>((newest, candidate) => {
    const assets = selectReleaseAsset(candidate, assetName);
    if (!assets || (newest && !isNewerRelease(candidate, newest.release))) {
      return newest;
    }
    return { release: candidate, assets };
  }, undefined);
}

export async function latestCliRelease(
  assetName: string,
  executableName: string,
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
  const release = newestRelease(stableReleases);
  if (!release) {
    throw new Error("No stable outfitting-manager CLI release was found.");
  }

  const selected = newestReleaseWithAsset(stableReleases, assetName);
  if (!selected) {
    throw new Error(`Release ${release.tag_name} does not contain ${assetName} and its checksum.`);
  }

  return {
    version: releaseVersion(selected.release.tag_name),
    assetUrl: selected.assets.asset.browser_download_url,
    checksumUrl: selected.assets.checksum.browser_download_url,
    executableName,
  };
}
