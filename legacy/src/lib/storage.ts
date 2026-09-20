/**
 * Asset storage, behind a driver.
 *
 * The bundle has to be written by the web process and read back by the worker.
 * On one host a shared volume does that; split across hosts — a web app on one
 * platform and the worker on another — there is no shared disk and it has to
 * be object storage.
 *
 * So the storage surface is a driver interface with two implementations, and
 * the rest of the app neither knows nor cares which is configured.
 *
 * One asymmetry matters and shapes the interface. ffmpeg, tesseract and
 * Whisper take a FILE PATH, not bytes — they cannot read from a stream or a
 * URL. So alongside `get`, the driver exposes `materialise`, which guarantees
 * a real local path. On the filesystem driver that is free; on S3 it is a
 * download to a temp file with a cleanup handle. Callers that run instruments
 * use `materialise`; callers that just need bytes use `get`.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredFile {
  /** The key the asset is addressed by. Stored in the database. */
  storagePath: string;
  byteSize: number;
}

export interface Materialised {
  path: string;
  /** Releases a temp copy. A no-op on the filesystem driver. */
  cleanup: () => Promise<void>;
}

export interface StorageDriver {
  readonly kind: "filesystem" | "s3";
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  materialise(key: string): Promise<Materialised>;
  remove(key: string): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Filesystem — the default, and correct whenever web and worker share a disk.
 * ------------------------------------------------------------------ */

export const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT ?? join(process.cwd(), "storage"));

function resolveLocal(key: string): string {
  const full = resolve(STORAGE_ROOT, key);
  // Keys are attacker-influenced via uploaded filenames; refuse anything that
  // escapes the root rather than trusting the caller.
  if (!full.startsWith(STORAGE_ROOT + "/") && full !== STORAGE_ROOT) {
    throw new Error(`Refusing to resolve a path outside the storage root: ${key}`);
  }
  return full;
}

class FilesystemDriver implements StorageDriver {
  readonly kind = "filesystem" as const;

  async put(key: string, data: Buffer): Promise<void> {
    const path = resolveLocal(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(resolveLocal(key));
  }

  async materialise(key: string): Promise<Materialised> {
    // Already a real file. No copy, no cleanup.
    return { path: resolveLocal(key), cleanup: async () => {} };
  }

  async remove(key: string): Promise<void> {
    await rm(resolveLocal(key), { force: true });
  }
}

/* ------------------------------------------------------------------ *
 * S3-compatible — AWS, Cloudflare R2, Backblaze, MinIO.
 * ------------------------------------------------------------------ */

class S3Driver implements StorageDriver {
  readonly kind = "s3" as const;

  constructor(
    private readonly bucket: string,
    private readonly client: import("@aws-sdk/client-s3").S3Client,
  ) {}

  async put(key: string, data: Buffer, contentType?: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: data, ContentType: contentType,
    }));
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`No body returned for ${key}`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async materialise(key: string): Promise<Materialised> {
    // The instruments need a real path, so the object is downloaded to a temp
    // file and the caller is handed a cleanup it is expected to call.
    const dir = join(tmpdir(), `asset-${randomUUID().slice(0, 8)}`);
    await mkdir(dir, { recursive: true });
    const path = join(dir, key.split("/").pop() ?? "asset");
    await writeFile(path, await this.get(key));
    return { path, cleanup: async () => { await rm(dir, { recursive: true, force: true }); } };
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/* ------------------------------------------------------------------ */

let driver: StorageDriver | null = null;

/**
 * S3 is used when a bucket is configured; otherwise the filesystem.
 *
 * Deliberately implicit: a deployment that sets S3_BUCKET means it, and one
 * that does not has a volume. Making it an explicit mode as well would just
 * add a second thing to get wrong.
 */
export function storage(): StorageDriver {
  if (driver) return driver;

  const config = s3Config();
  if (!config.bucket) {
    driver = new FilesystemDriver();
    return driver;
  }

  // Imported lazily so a filesystem deployment never loads the AWS SDK.
  const { S3Client } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
  driver = new S3Driver(config.bucket, new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.accessKeyId && config.secretAccessKey
      ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
      : undefined, // fall back to the ambient credential chain
  }));
  return driver;
}

/**
 * Read the bucket configuration, accepting two sets of names.
 *
 * `S3_*` is what this app documents. `AWS_*` is what Railway's Storage Bucket
 * injects when you attach one, and it is the same set of values under
 * different keys. Reading both means attaching a Railway bucket needs no
 * variable mapping at all — which removes the most likely setup mistake,
 * since a mismapped endpoint fails at the first upload rather than at deploy.
 */
export function s3Config() {
  return {
    bucket: process.env.S3_BUCKET ?? process.env.AWS_S3_BUCKET_NAME,
    endpoint: process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT_URL,
    region: process.env.S3_REGION ?? process.env.AWS_DEFAULT_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY,
    // Railway reports this as AWS_S3_URL_STYLE=path; most S3-compatible
    // stores that are not AWS itself need path-style addressing.
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === "true" ||
      process.env.AWS_S3_URL_STYLE === "path",
  };
}

/** Test seam. */
export function __setDriver(next: StorageDriver | null): void {
  driver = next;
}

export function buildDir(buildId: number | string): string {
  return `build-${buildId}`;
}

/** Strip directory components and anything unsafe for a filename. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 180) || "upload";
}

export async function storeUpload(
  buildId: number | string,
  kind: string,
  filename: string,
  data: Buffer,
  contentType?: string,
): Promise<StoredFile> {
  // A uuid prefix keeps two uploads of the same name in one bundle distinct.
  const key = `${buildDir(buildId)}/${kind}/${randomUUID().slice(0, 8)}-${safeFilename(filename)}`;
  await storage().put(key, data, contentType);
  return { storagePath: key, byteSize: data.byteLength };
}

/** Read an asset's bytes. */
export async function readAsset(key: string): Promise<Buffer> {
  return storage().get(key);
}

/** Write a derived asset — an extracted audio track, a TTS take. */
export async function writeAsset(key: string, data: Buffer, contentType?: string): Promise<void> {
  await storage().put(key, data, contentType);
}

/**
 * Get a real local path for an asset, for the tools that need one.
 *
 * Always pair with the returned cleanup, in a finally: on the S3 driver this
 * is a temp file, and skipping cleanup fills the worker's disk one job at a
 * time.
 */
export async function materialiseAsset(key: string): Promise<Materialised> {
  return storage().materialise(key);
}
