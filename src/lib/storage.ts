/**
 * Object storage abstraction (S3-compatible: AWS S3 or Cloudflare R2).
 *
 * Server-only. The browser never receives storage credentials — it gets a
 * short-lived presigned URL for a single PUT or GET. Configure via
 * STORAGE_BUCKET, STORAGE_REGION, STORAGE_ENDPOINT (R2/non-AWS), and
 * STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY (see .env.example).
 *
 * When storage isn't configured, isStorageConfigured() returns false and
 * callers must fall back to a real alternative (the text-answer path) —
 * never fabricate a storage key or pretend an upload succeeded.
 */

import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_RECORDING_MIME_TYPES = new Set(['video/webm', 'video/mp4', 'audio/webm']);
const ALLOWED_RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
/** Canonical extension for each allowed resume MIME type, used to build the storage key. */
export const RESUME_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const ALLOWED_RESUME_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);

export const MAX_RECORDING_BYTES = 250 * 1024 * 1024; // 250MB per response
export const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10MB

let client: S3Client | null | undefined;

function getClient(): S3Client | null {
  if (client !== undefined) return client;

  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    client = null;
    return client;
  }

  client = new S3Client({
    region: process.env.STORAGE_REGION || 'auto',
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    credentials: { accessKeyId, secretAccessKey },
    // Required for Supabase Storage's S3-compatible endpoint, and for most
    // other non-AWS S3-compatible hosts (R2, MinIO): without this, the SDK
    // defaults to virtual-hosted-style addressing (bucket-as-subdomain),
    // which these hosts don't serve. Path-style also still works fine
    // against real AWS S3, so this is safe across every provider this
    // abstraction supports.
    forcePathStyle: true,
  });
  return client;
}

export function isStorageConfigured(): boolean {
  return getClient() !== null;
}

function bucket(): string {
  const b = process.env.STORAGE_BUCKET;
  if (!b) throw new Error('STORAGE_BUCKET is not configured');
  return b;
}

/** Strips anything that isn't safe in an object key — no path traversal, no unexpected separators. Dots are excluded too so a value like "../../etc" can't reintroduce ".." once slashes are stripped; the literal "." between name and extension is always added explicitly by the caller, never sourced from this function. */
function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function buildRecordingKey(params: { orgId: string; applicationId: string; questionId: string; ext: string }): string {
  const ext = sanitizeSegment(params.ext.replace(/^\./, '')) || 'webm';
  return [
    'recordings',
    sanitizeSegment(params.orgId),
    sanitizeSegment(params.applicationId),
    `${sanitizeSegment(params.questionId)}.${ext}`,
  ].join('/');
}

export function buildResumeKey(params: { orgId: string; applicationId: string; ext: string }): string {
  const ext = sanitizeSegment(params.ext.replace(/^\./, '')) || 'pdf';
  // No 'resumes/' literal prefix here (unlike buildRecordingKey's
  // 'recordings/' prefix): this app's STORAGE_BUCKET is commonly a
  // dedicated bucket already named for its contents (e.g. a Supabase
  // bucket literally named "resumes"). Prefixing the key too produced a
  // redundant bucket/resumes/resumes/... path. orgId-scoping still
  // prevents any cross-org collision, and this can't collide with
  // recording keys (which always start with the literal "recordings/").
  return [sanitizeSegment(params.orgId), `${sanitizeSegment(params.applicationId)}.${ext}`].join('/');
}

// Phase 4 (candidate platform): a candidate's own profile resume, uploaded
// before they've applied to anything — so there's no orgId/applicationId to
// scope it by, unlike buildResumeKey above (which stays exactly as-is for
// the existing application-attached resume flow). Scoped by userId instead,
// under a distinct 'candidates/' prefix so it can never collide with an
// orgId segment from buildResumeKey. Deliberately a stable key per user
// (not one-per-upload) — replacing a resume overwrites this object, giving
// a clean "current resume" concept without accumulating orphaned files;
// see Application.resume / Resume model for the separate, immutable
// per-application snapshot that a submitted application keeps regardless of
// later profile resume changes.
export function buildCandidateResumeKey(params: { userId: string; ext: string }): string {
  const ext = sanitizeSegment(params.ext.replace(/^\./, '')) || 'pdf';
  return ['candidates', sanitizeSegment(params.userId), `resume.${ext}`].join('/');
}

/**
 * Direct server-side write of an in-memory buffer — used for copying a
 * candidate's profile resume into an immutable per-application snapshot
 * (see buildResumeKey vs buildCandidateResumeKey). Unlike createUploadUrl,
 * this is not a presigned URL for a browser to PUT to; it writes right now,
 * from the server, using the same S3 client/bucket as everything else here.
 */
export async function putObjectBuffer(params: { key: string; body: Buffer; mimeType: string }): Promise<boolean> {
  const s3 = getClient();
  if (!s3) return false;

  try {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket(), Key: params.key, Body: params.body, ContentType: params.mimeType })
    );
    return true;
  } catch (err) {
    console.error('[storage] putObjectBuffer failed:', err);
    return false;
  }
}

export function isAllowedRecordingMimeType(mimeType: string): boolean {
  return ALLOWED_RECORDING_MIME_TYPES.has(mimeType);
}

export function isAllowedResumeMimeType(mimeType: string): boolean {
  return ALLOWED_RESUME_MIME_TYPES.has(mimeType);
}

/** Server-side extension check — never trust the client's MIME-type claim alone. */
export function isAllowedResumeExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_RESUME_EXTENSIONS.has(ext);
}

/** Issues a short-lived presigned PUT URL. Throws if storage isn't configured — callers must check isStorageConfigured() first. */
export async function createUploadUrl(params: {
  key: string;
  mimeType: string;
  maxBytes: number;
}): Promise<{ url: string; key: string; expiresInSec: number }> {
  const s3 = getClient();
  if (!s3) throw new Error('Object storage is not configured');

  const expiresInSec = 15 * 60;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket(),
      Key: params.key,
      ContentType: params.mimeType,
      // Deliberately NOT setting ContentLength here. Browsers treat
      // Content-Length as a forbidden header — fetch() always sets it
      // itself from the actual body size and JS can't override it. If
      // ContentLength is included on the command passed to getSignedUrl,
      // the SDK bakes "content-length" into the presigned URL's
      // X-Amz-SignedHeaders. Real AWS S3 is lenient about this, but
      // S3-compatible backends (Supabase Storage, R2, MinIO) often
      // enforce it strictly, so the browser's PUT gets rejected before
      // it ever completes — surfacing here as a bare network/CORS
      // failure with no useful response body. Size is still enforced:
      // the caller already checked the claimed size against
      // MAX_RESUME_BYTES/MAX_RECORDING_BYTES before requesting this URL,
      // and the complete route re-verifies the real uploaded size via
      // headObject() afterward — that's the authoritative check either way.
    }),
    { expiresIn: expiresInSec }
  );

  return { url, key: params.key, expiresInSec };
}

/** Issues a short-lived presigned GET URL for authenticated recruiter playback. Never a permanent public URL. */
export async function createViewUrl(key: string, expiresInSec = 10 * 60): Promise<string | null> {
  const s3 = getClient();
  if (!s3) return null;

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: expiresInSec });
}

/** Confirms an object actually exists (and returns its size) rather than trusting the client's "I uploaded it" claim. */
export async function headObject(key: string): Promise<{ exists: true; sizeBytes: number } | { exists: false }> {
  const s3 = getClient();
  if (!s3) return { exists: false };

  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { exists: true, sizeBytes: result.ContentLength ?? 0 };
  } catch {
    return { exists: false };
  }
}

/**
 * Downloads an object's full body into memory, for server-side processing
 * (resume text extraction, video transcription). Callers are responsible
 * for checking size against their own safe-to-buffer limit first (e.g.
 * MAX_RESUME_BYTES, MAX_TRANSCRIBABLE_BYTES) — this function itself does
 * not cap size. Returns null if storage isn't configured or the object
 * can't be read.
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  const s3 = getClient();
  if (!s3) return null;

  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const body = result.Body;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body as unknown as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err) {
    console.error('[storage] getObjectBuffer failed:', err);
    return null;
  }
}
