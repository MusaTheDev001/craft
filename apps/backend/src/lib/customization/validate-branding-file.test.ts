import { describe, expect, it } from 'vitest';
import {
  validateBrandingFile,
  MAX_BRANDING_FILE_BYTES,
  type BrandingFileValidationError,
} from './validate-branding-file';

/**
 * Build a byte buffer from a list of byte values and/or ASCII strings.
 */
function bytes(...parts: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'number') {
      out.push(part & 0xff);
    } else {
      for (let i = 0; i < part.length; i++) {
        out.push(part.charCodeAt(i) & 0xff);
      }
    }
  }
  return new Uint8Array(out);
}

/**
 * Create a buffer of the given size filled with zeros, with the given
 * prefix bytes written at the start.
 */
function sizedBuffer(size: number, prefix: Uint8Array = new Uint8Array(0)): Uint8Array {
  const buf = new Uint8Array(size);
  buf.set(prefix.subarray(0, Math.min(prefix.length, size)), 0);
  return buf;
}

// PNG signature: 89 50 4E 47 0D 0A 1A 0A
const PNG_SIGNATURE = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

// JPEG signature: FF D8 FF
const JPEG_SIGNATURE = bytes(0xff, 0xd8, 0xff);

// WebP signature: "RIFF" at offsets 0-3, 4-byte size, "WEBP" at offsets 8-11
const WEBP_SIGNATURE = bytes('RIFF', 0x24, 0x00, 0x00, 0x00, 'WEBP');

// RIFF container that is NOT WebP (e.g. WAV): "RIFF" at 0-3, "WAVE" at 8-11
const RIFF_WAVE_SIGNATURE = bytes('RIFF', 0x24, 0x00, 0x00, 0x00, 'WAVE');

function expectError(
  result: ReturnType<typeof validateBrandingFile>,
  code: BrandingFileValidationError,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBe(code);
  }
}

describe('validateBrandingFile', () => {
  describe('extension derivation (#1388)', () => {
    it('rejects a filename with no dot at all ("png")', () => {
      const result = validateBrandingFile({
        filename: 'png',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expectError(result, 'INVALID_EXTENSION');
    });

    it('rejects a filename with no extension ("logo")', () => {
      const result = validateBrandingFile({
        filename: 'logo',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expectError(result, 'INVALID_EXTENSION');
    });

    it('rejects a filename with only a leading dot (".png")', () => {
      const result = validateBrandingFile({
        filename: '.png',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expectError(result, 'INVALID_EXTENSION');
    });

    it('accepts an uppercase extension case-insensitively ("logo.PNG")', () => {
      const result = validateBrandingFile({
        filename: 'logo.PNG',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expect(result.ok).toBe(true);
    });

    it('accepts a normal lowercase extension ("logo.png")', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expect(result.ok).toBe(true);
    });

    it('rejects an unsupported extension ("logo.gif")', () => {
      const result = validateBrandingFile({
        filename: 'logo.gif',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expectError(result, 'INVALID_EXTENSION');
    });
  });

  describe('magic-byte verification (#1389)', () => {
    it('accepts a valid PNG file', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: sizedBuffer(64, PNG_SIGNATURE),
      });
      expect(result.ok).toBe(true);
    });

    it('accepts a valid JPEG file', () => {
      const result = validateBrandingFile({
        filename: 'logo.jpg',
        content: sizedBuffer(64, JPEG_SIGNATURE),
      });
      expect(result.ok).toBe(true);
    });

    it('accepts a valid WebP file with the WEBP marker at offsets 8-11', () => {
      const result = validateBrandingFile({
        filename: 'logo.webp',
        content: sizedBuffer(64, WEBP_SIGNATURE),
      });
      expect(result.ok).toBe(true);
    });

    it('rejects a RIFF/WAVE file renamed to .webp', () => {
      const result = validateBrandingFile({
        filename: 'logo.webp',
        content: sizedBuffer(64, RIFF_WAVE_SIGNATURE),
      });
      expectError(result, 'MAGIC_BYTES_MISMATCH');
    });

    it('rejects a RIFF container without the WEBP marker', () => {
      const result = validateBrandingFile({
        filename: 'logo.webp',
        content: sizedBuffer(64, bytes('RIFF', 0x00, 0x00, 0x00, 0x00, 'AVI ')),
      });
      expectError(result, 'MAGIC_BYTES_MISMATCH');
    });

    it('rejects a PNG file whose content is not PNG', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: sizedBuffer(64, JPEG_SIGNATURE),
      });
      expectError(result, 'MAGIC_BYTES_MISMATCH');
    });

    it('rejects content that is too short to contain a signature', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: bytes(0x89, 0x50),
      });
      expectError(result, 'MAGIC_BYTES_MISMATCH');
    });
  });

  describe('size limit (#1390)', () => {
    it('accepts a file at the shared limit', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: sizedBuffer(MAX_BRANDING_FILE_BYTES, PNG_SIGNATURE),
      });
      expect(result.ok).toBe(true);
    });

    it('rejects a file one byte over the shared limit', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: sizedBuffer(MAX_BRANDING_FILE_BYTES + 1, PNG_SIGNATURE),
      });
      expectError(result, 'FILE_TOO_LARGE');
    });

    it('rejects a 3 MB file consistently with the shared limit', () => {
      const threeMegabytes = 3 * 1024 * 1024;
      expect(threeMegabytes).toBeGreaterThan(MAX_BRANDING_FILE_BYTES);

      const result = validateBrandingFile({
        filename: 'logo.png',
        content: sizedBuffer(threeMegabytes, PNG_SIGNATURE),
      });
      expectError(result, 'FILE_TOO_LARGE');
    });

    it('rejects an empty file', () => {
      const result = validateBrandingFile({
        filename: 'logo.png',
        content: new Uint8Array(0),
      });
      expect(result.ok).toBe(false);
    });
  });
});