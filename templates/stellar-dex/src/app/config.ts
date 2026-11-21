const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Returns `value` when it is a valid hex colour (#rgb, #rrggbb or #rrggbbaa),
 * otherwise returns `fallback`. Used to keep untrusted branding colours from
 * breaking out of the injected <style> block.
 */
export function safeColor(value: string | undefined | null, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}
