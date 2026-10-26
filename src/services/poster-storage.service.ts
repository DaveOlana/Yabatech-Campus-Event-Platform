import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { del, head, list } from "@vercel/blob";

export const MAX_POSTER_BYTES = 4 * 1024 * 1024;
export const POSTER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const BLOB_POSTER_PREFIX = "ycep/posters/";
const LOCAL_POSTER_URL_PREFIX = "/uploads/event-posters/";
const LOCAL_POSTER_PATH_PREFIX = "local:event-posters/";
const LOCAL_POSTER_DIRECTORY = fileURLToPath(new URL("../../public/uploads/event-posters/", import.meta.url));
const BLOB_PATH_PATTERN = /^ycep\/posters\/(?:[0-9a-f-]{36}\/)?[0-9a-f-]{36}\.(?:png|jpg|webp)$/i;
const OWNER_SCOPED_BLOB_PATH_PATTERN = /^ycep\/posters\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/i;
const LOCAL_PATH_PATTERN = /^local:event-posters\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/i;

export interface PosterUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface ManagedPosterReference {
  url: string;
  pathname: string;
}

export interface ListedManagedPoster extends ManagedPosterReference {
  uploadedAt: Date;
  size: number;
}

export class PosterUploadError extends Error {
  readonly statusCode = 400;
  readonly expose = true;

  constructor(message: string) {
    super(message);
    this.name = "PosterUploadError";
  }
}

function detectedPosterType(buffer: Buffer): { mime: string; extension: string } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

export function validatePosterUpload(file: PosterUpload): { mime: string; extension: string } {
  if (file.size < 1 || file.buffer.length < 1) throw new PosterUploadError("The selected poster file is empty.");
  if (file.size > MAX_POSTER_BYTES || file.buffer.length > MAX_POSTER_BYTES) throw new PosterUploadError("Poster files must be 4 MB or smaller.");
  if (!(POSTER_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    throw new PosterUploadError("Poster files must be JPEG, PNG, or WebP images.");
  }
  const detected = detectedPosterType(file.buffer);
  if (!detected || detected.mime !== file.mimetype) {
    throw new PosterUploadError("The poster file content does not match a supported image type.");
  }
  return detected;
}

export function productionUsesDirectPosterUpload(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function storePoster(file: PosterUpload): Promise<ManagedPosterReference> {
  const detected = validatePosterUpload(file);
  if (productionUsesDirectPosterUpload()) {
    throw new PosterUploadError("Production posters must be uploaded directly to managed storage before the draft is saved.");
  }
  const fileName = `${randomUUID()}.${detected.extension}`;
  await mkdir(LOCAL_POSTER_DIRECTORY, { recursive: true });
  await writeFile(path.join(LOCAL_POSTER_DIRECTORY, fileName), file.buffer, { flag: "wx" });
  return { url: `${LOCAL_POSTER_URL_PREFIX}${fileName}`, pathname: `${LOCAL_POSTER_PATH_PREFIX}${fileName}` };
}

function isPublicBlobUrlForPath(value: string, pathname: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && decodeURIComponent(url.pathname.slice(1)) === pathname;
  } catch {
    return false;
  }
}

export function isManagedPosterPath(value: string | null | undefined): value is string {
  return typeof value === "string" && (BLOB_PATH_PATTERN.test(value) || LOCAL_PATH_PATTERN.test(value));
}

async function readSignatureBytes(response: Response): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const bytes: number[] = [];
  try {
    while (bytes.length < 12) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.push(...value.subarray(0, 12 - bytes.length));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.from(bytes);
}

export function validateUploadedBlobPosterReference(
  candidate: ManagedPosterReference,
  organizerAuthorizationId?: string,
): ManagedPosterReference {
  if (!BLOB_PATH_PATTERN.test(candidate.pathname) || !isPublicBlobUrlForPath(candidate.url, candidate.pathname)) {
    throw new PosterUploadError("The uploaded poster reference is invalid.");
  }
  if (organizerAuthorizationId) {
    const ownerMatch = candidate.pathname.match(OWNER_SCOPED_BLOB_PATH_PATTERN);
    if (!ownerMatch || ownerMatch[1].toLowerCase() !== organizerAuthorizationId.toLowerCase()) {
      throw new PosterUploadError("The uploaded poster does not belong to this organizer authorization.");
    }
  }
  return candidate;
}

export async function verifyUploadedBlobPoster(candidate: ManagedPosterReference, organizerAuthorizationId?: string): Promise<ManagedPosterReference> {
  validateUploadedBlobPosterReference(candidate, organizerAuthorizationId);
  const metadata = await head(candidate.pathname);
  if (metadata.pathname !== candidate.pathname || metadata.url !== candidate.url) {
    throw new PosterUploadError("The uploaded poster reference could not be verified.");
  }
  if (!POSTER_MIME_TYPES.includes(metadata.contentType as (typeof POSTER_MIME_TYPES)[number]) || metadata.size < 1 || metadata.size > MAX_POSTER_BYTES) {
    throw new PosterUploadError("The uploaded poster does not meet YCEP's file requirements.");
  }
  const response = await fetch(metadata.url, { headers: { Range: "bytes=0-11" }, redirect: "error" });
  if (!response.ok) throw new PosterUploadError("The uploaded poster could not be verified.");
  const bytes = await readSignatureBytes(response);
  const detected = detectedPosterType(bytes);
  if (!detected || detected.mime !== metadata.contentType) {
    throw new PosterUploadError("The uploaded poster file content does not match a supported image type.");
  }
  return { url: metadata.url, pathname: metadata.pathname };
}

export async function deleteManagedPoster(pathname: string | null | undefined): Promise<void> {
  if (!isManagedPosterPath(pathname)) return;
  if (pathname.startsWith(LOCAL_POSTER_PATH_PREFIX)) {
    const fileName = path.basename(pathname.slice(LOCAL_POSTER_PATH_PREFIX.length));
    await unlink(path.join(LOCAL_POSTER_DIRECTORY, fileName)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  await del(pathname);
}

export async function listManagedPosters(): Promise<ListedManagedPoster[]> {
  if (!productionUsesDirectPosterUpload()) {
    const names = await readdir(LOCAL_POSTER_DIRECTORY).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    });
    const posters: ListedManagedPoster[] = [];
    for (const name of names) {
      const pathname = `${LOCAL_POSTER_PATH_PREFIX}${name}`;
      if (!LOCAL_PATH_PATTERN.test(pathname)) continue;
      const details = await stat(path.join(LOCAL_POSTER_DIRECTORY, name));
      posters.push({ pathname, url: `${LOCAL_POSTER_URL_PREFIX}${name}`, uploadedAt: details.birthtime, size: details.size });
    }
    return posters;
  }

  const posters: ListedManagedPoster[] = [];
  let cursor: string | undefined;
  do {
    const result = await list({ prefix: BLOB_POSTER_PREFIX, limit: 1000, cursor });
    posters.push(...result.blobs.map((blob) => ({ pathname: blob.pathname, url: blob.url, uploadedAt: blob.uploadedAt, size: blob.size })));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return posters;
}
