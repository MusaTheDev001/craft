/**
 * Request body size validation utilities.
 * Prevents resource exhaustion by rejecting oversized payloads early.
 */

export const DEFAULT_MAX_REQUEST_SIZE = 50 * 1024 * 1024; // 50MB
export const DEFAULT_MAX_FORM_DATA_SIZE = 100 * 1024 * 1024; // 100MB
export const DEFAULT_MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
/**
 * Single source of truth for the branding file size limit.
 * The stricter limit (2MB) wins so the validator and request-size
 * checks agree on the same ceiling.
 */
export const MAX_BRANDING_FILE_BYTES = 2 * 1024 * 1024; // 2MB
export const DEFAULT_MAX_BRANDING_FILE_SIZE = MAX_BRANDING_FILE_BYTES;

export interface SizeLimit {
    bytes: number;
    label: string;
}

/**
 * Result of checking a request's Content-Length header.
 *
 * - `{ ok: true, size }`: the header is present, valid, and within the limit.
 * - `{ ok: false, reason: 'missing' }`: no Content-Length header was provided.
 * - `{ ok: false, reason: 'invalid' }`: the header is not a valid non-negative
 *   integer (e.g. non-numeric or negative).
 * - `{ ok: false, reason: 'too_large' }`: the declared size exceeds `maxBytes`.
 */
export type RequestSizeCheckResult =
    | { ok: true; size: number }
    | { ok: false; reason: 'missing' | 'invalid' | 'too_large' };

/**
 * Check a request's Content-Length header against a size limit.
 *
 * Distinguishes a missing header from an invalid header and from an
 * oversized body, so callers never mistake a missing header for success.
 * See {@link RequestSizeCheckResult} for the possible outcomes.
 */
export function checkRequestSize(
    contentLength: string | null,
    maxBytes: number,
): RequestSizeCheckResult {
    if (!contentLength) return { ok: false, reason: 'missing' };

    const size = parseInt(contentLength, 10);
    // Negative lengths indicate malformed or malicious requests.
    if (isNaN(size) || size < 0) {
        return { ok: false, reason: 'invalid' };
    }

    if (size > maxBytes) {
        return { ok: false, reason: 'too_large' };
    }

    return { ok: true, size };
}

/**
 * Format bytes as human-readable size (e.g., "5 MB", "100 KB").
 *
 * Supported range: finite, non-negative numbers from 0 up to the largest
 * unit in the `sizes` array (TB). Values below 1 byte are reported in
 * `bytes`, and values of 1 TB or more are reported in `TB`.
 * Non-finite (e.g. `NaN`, `Infinity`) or negative input returns `'0 bytes'`.
 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 bytes';
    if (bytes === 0) return '0 bytes';

    const k = 1024;
    const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    const rawIndex = Math.floor(Math.log(bytes) / Math.log(k));
    const i = Math.min(Math.max(rawIndex, 0), sizes.length - 1);

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate content-length header and return error response if limit exceeded
 */
export function validateContentLength(
    contentLength: string | null,
    maxBytes: number,
): { valid: true; size: number } | { valid: false; message: string } {
    if (!contentLength) {
        return { valid: false, message: 'Missing Content-Length header' };
    }

    const size = parseInt(contentLength, 10);
    // Negative lengths indicate malformed or malicious requests.
    if (isNaN(size) || size < 0) {
        return { valid: false, message: 'Invalid Content-Length header' };
    }

    if (size > maxBytes) {
        return {
            valid: false,
            message: `Request body exceeds maximum size of ${formatBytes(maxBytes)}. Received: ${formatBytes(size)}.`,
        };
    }

    return { valid: true, size };
}
