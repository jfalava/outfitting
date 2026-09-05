import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { emptyFontArchive, unpackFontArchive, type FontArchive } from "@/fonts/archive";
import { FONT_ARCHIVE_KEY, FONT_CHECKSUM_KEY } from "@/fonts/constants";
import { r2Credentials } from "@/fonts/keychain";
import { loadDeployConfig } from "../../../iac/src/deploy-config";

export interface FontObjectStore {
  getArchive(): Promise<Uint8Array | undefined>;
  putArchive(archive: Uint8Array, checksum: string): Promise<void>;
}

async function bodyBytes(
  body: { transformToByteArray(): Promise<Uint8Array> } | undefined,
): Promise<Uint8Array> {
  if (body === undefined) {
    throw new Error("R2 object body was empty.");
  }
  return body.transformToByteArray();
}

export async function createR2ObjectStore(): Promise<FontObjectStore> {
  const credentials = await r2Credentials();
  const client = new S3Client({
    region: "auto",
    endpoint: credentials.endpoint,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
  const bucket = loadDeployConfig().privateFontsBucket;

  return {
    async getArchive() {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: FONT_ARCHIVE_KEY,
          }),
        );
        return await bodyBytes(response.Body);
      } catch (cause) {
        if (cause instanceof NoSuchKey) {
          return undefined;
        }
        throw cause;
      }
    },
    async putArchive(archive, checksum) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: FONT_ARCHIVE_KEY,
          Body: archive,
          ContentType: "application/gzip",
        }),
      );
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: FONT_CHECKSUM_KEY,
          Body: checksum,
          ContentType: "text/plain; charset=utf-8",
        }),
      );
    },
  };
}

export async function loadRemoteArchive(store: FontObjectStore): Promise<FontArchive> {
  const archive = await store.getArchive();
  if (archive === undefined || archive.byteLength === 0) {
    return emptyFontArchive();
  }
  return unpackFontArchive(archive);
}
