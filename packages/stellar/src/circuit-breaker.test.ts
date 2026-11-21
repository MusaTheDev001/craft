import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts in CLOSED state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('transitions from CLOSED to OPEN when failure threshold is reached', () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      now: () => now,
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');

    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
  });

  it('transitions from OPEN to HALF_OPEN after resetTimeoutMs elapses', () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });

    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');

    now = 999;
    expect(breaker.getState()).toBe('OPEN');

    now = 1000;
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('returns to CLOSED when a HALF_OPEN probe succeeds', () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });

    breaker.recordFailure();
    now = 1000;
    expect(breaker.getState()).toBe('HALF_OPEN');

    breaker.recordSuccess();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('returns to OPEN when a HALF_OPEN probe fails', () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
    });

    breaker.recordFailure();
    now = 1000;
    expect(breaker.getState()).toBe('HALF_OPEN');

    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
  });

  it('invokes onStateChange callbacks on transitions', () => {
    let now = 0;
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      now: () => now,
      onStateChange,
    });

    breaker.recordFailure();
    expect(onStateChange).toHaveBeenCalledWith('OPEN', 'CLOSED');

    now = 1000;
    expect(breaker.getState()).toBe('HALF_OPEN');
    expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'OPEN');

    breaker.recordSuccess();
    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'HALF_OPEN');
  });
});

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
