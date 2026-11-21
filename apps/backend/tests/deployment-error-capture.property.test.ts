import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { DeploymentErrorCapture } from '../src/services/deployment-error-capture';

describe('DeploymentErrorCapture property tests', () => {
  let capture: DeploymentErrorCapture;

  beforeEach(() => {
    capture = new DeploymentErrorCapture();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures any thrown error message without loss', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const error = new Error(message);
        const captured = capture.capture(error);
        expect(captured.message).toBe(message);
        expect(captured.name).toBe('Error');
      }),
    );
  });

  it('records a timestamp for every captured error', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const captured = capture.capture(new Error(message));
        expect(captured.timestamp).toBeInstanceOf(Date);
        expect(Number.isNaN(captured.timestamp.getTime())).toBe(false);
      }),
    );
  });

  it('preserves arbitrary error metadata', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (message, metadata) => {
          const error = Object.assign(new Error(message), { metadata });
          const captured = capture.capture(error);
          expect(captured.metadata).toEqual(metadata);
        },
      ),
    );
  });
});
