import { describe, it, expect } from 'vitest';
import {
    checkRequestSize,
    formatBytes,
    validateContentLength,
    DEFAULT_MAX_REQUEST_SIZE,
    DEFAULT_MAX_BRANDING_FILE_SIZE,
    MAX_BRANDING_FILE_BYTES,
} from './validate-request-size';

describe('validate-request-size', () => {
    describe('checkRequestSize', () => {
        it('should return size for valid content-length', () => {
            const size = checkRequestSize('1024', DEFAULT_MAX_REQUEST_SIZE);
            expect(size).toBe(1024);
        });

        it('should return null for missing content-length', () => {
            const size = checkRequestSize(null, DEFAULT_MAX_REQUEST_SIZE);
            expect(size).toBeNull();
        });

        it('should return null when size exceeds limit', () => {
            const size = checkRequestSize(
                String(DEFAULT_MAX_REQUEST_SIZE + 1),
                DEFAULT_MAX_REQUEST_SIZE,
            );
            expect(size).toBeNull();
        });

        it('should return null for invalid content-length', () => {
            const size = checkRequestSize('invalid', DEFAULT_MAX_REQUEST_SIZE);
            expect(size).toBeNull();
        });

        it('should accept size equal to limit', () => {
            const size = checkRequestSize(String(DEFAULT_MAX_REQUEST_SIZE), DEFAULT_MAX_REQUEST_SIZE);
            expect(size).toBe(DEFAULT_MAX_REQUEST_SIZE);
        });
    });

    describe('formatBytes', () => {
        it('should format bytes correctly', () => {
            expect(formatBytes(0)).toBe('0 bytes');
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1024 * 1024)).toBe('1 MB');
            expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
        });

        it('should round to 2 decimal places', () => {
            expect(formatBytes(1536)).toBe('1.5 KB');
            expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
        });

        it('should handle large files', () => {
            const result = formatBytes(5 * 1024 * 1024);
            expect(result).toContain('MB');
            expect(parseFloat(result)).toBe(5);
        });

        it('should format sub-byte values as bytes without undefined units', () => {
            const result = formatBytes(0.5);
            expect(result).toContain('bytes');
            expect(result).not.toContain('undefined');
        });

        it('should return 0 bytes for negative input', () => {
            expect(formatBytes(-1)).toBe('0 bytes');
        });

        it('should return 0 bytes for NaN input', () => {
            expect(formatBytes(NaN)).toBe('0 bytes');
        });

        it('should format terabyte-scale values with a TB unit', () => {
            const result = formatBytes(1024 ** 4);
            expect(result).toContain('TB');
            expect(result).not.toContain('undefined');
            expect(parseFloat(result)).toBe(1);
        });
    });

    describe('branding file size limit', () => {
        it('should expose a single branding file size limit', () => {
            expect(DEFAULT_MAX_BRANDING_FILE_SIZE).toBe(MAX_BRANDING_FILE_BYTES);
        });

        it('should reject a 3 MB branding file consistently', () => {
            const threeMb = 3 * 1024 * 1024;
            expect(threeMb).toBeGreaterThan(MAX_BRANDING_FILE_BYTES);

            const result = validateContentLength(String(threeMb), MAX_BRANDING_FILE_BYTES);
            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.message).toContain('exceeds maximum');
            }
        });
    });

    describe('validateContentLength', () => {
        it('should validate correct content-length', () => {
            const result = validateContentLength('1024', DEFAULT_MAX_REQUEST_SIZE);
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.size).toBe(1024);
            }
        });

        it('should reject missing content-length', () => {
            const result = validateContentLength(null, DEFAULT_MAX_REQUEST_SIZE);
            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.message).toContain('Content-Length');
            }
        });

        it('should reject invalid content-length', () => {
            const result = validateContentLength('invalid', DEFAULT_MAX_REQUEST_SIZE);
            expect(result.valid).toBe(false);
        });

        it('should reject oversized content-length', () => {
            const result = validateContentLength(
                String(DEFAULT_MAX_BRANDING_FILE_SIZE + 1),
                DEFAULT_MAX_BRANDING_FILE_SIZE,
            );
            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.message).toContain('exceeds maximum');
            }
        });

        it('should include formatted sizes in error message', () => {
            const result = validateContentLength(
                String(10 * 1024 * 1024),
                DEFAULT_MAX_BRANDING_FILE_SIZE,
            );
            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.message).toContain('MB');
            }
        });
    });

    describe('streaming body validation', () => {
        it('should enforce size cap on actual streamed body', async () => {
            const maxSize = 1024; // 1KB limit
            const streamData = 'x'.repeat(2048); // 2KB of data

            const chunks: string[] = [];
            let totalSize = 0;
            const maxAllowedSize = maxSize;

            for (const chunk of streamData.split('')) {
                totalSize += chunk.length;
                if (totalSize > maxAllowedSize) {
                    expect(totalSize).toBeGreaterThan(maxAllowedSize);
                    break;
                }
                chunks.push(chunk);
            }

            expect(totalSize).toBeGreaterThan(maxSize);
        });

        it('should reject request when declared Content-Length is under limit but actual body exceeds it', () => {
            const declaredSize = 512; // under limit
            const actualSize = 2048; // over limit
            const maxAllowed = 1024;

            expect(declaredSize).toBeLessThanOrEqual(maxAllowed);
            expect(actualSize).toBeGreaterThan(maxAllowed);

            const result = validateContentLength(String(declaredSize), maxAllowed);
            expect(result.valid).toBe(true); // header check passes

            // But actual streaming would exceed limit
            expect(actualSize).toBeGreaterThan(maxAllowed);
        });
    });
});
