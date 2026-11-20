import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker constructor validation', () => {
  it('uses defaults when no config is provided', () => {
    expect(() => new CircuitBreaker()).not.toThrow();
  });

  it('accepts positive integer values', () => {
    expect(
      () => new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1 }),
    ).not.toThrow();
  });

  it.each([0, -1, NaN])('rejects failureThreshold of %p', (value) => {
    expect(() => new CircuitBreaker({ failureThreshold: value })).toThrow(
      RangeError,
    );
  });

  it.each([0, -1, NaN])('rejects resetTimeoutMs of %p', (value) => {
    expect(() => new CircuitBreaker({ resetTimeoutMs: value })).toThrow(
      RangeError,
    );
  });

  it('rejects non-integer failureThreshold', () => {
    expect(() => new CircuitBreaker({ failureThreshold: 1.5 })).toThrow(
      RangeError,
    );
  });

  it('rejects non-integer resetTimeoutMs', () => {
    expect(() => new CircuitBreaker({ resetTimeoutMs: 1.5 })).toThrow(
      RangeError,
    );
  });
});
