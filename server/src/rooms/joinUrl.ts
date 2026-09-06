import { toDataURL } from "qrcode";

/**
 * Resolves the public-facing origin a join URL should be built from.
 *
 * `PUBLIC_BASE_URL` wins whenever it is set — Phase 7's deployment pins it so
 * the generated link is always correct on the deployed host, regardless of
 * what a proxy or load balancer reports in headers. Absent that, the origin
 * is derived from the connecting socket's own handshake headers, which is
 * what keeps the generated URL correct on a laptop and on a LAN IP during
 * phone testing without anyone editing a constant. Never a literal baked
 * into the source.
 */
export function resolveOrigin(headers: Record<string, string | string[] | undefined>): string {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (publicBaseUrl) return stripTrailingSlash(publicBaseUrl);

  const originHeader = firstValue(headers.origin);
  if (originHeader) return stripTrailingSlash(originHeader);

  const hostHeader = firstValue(headers.host);
  if (hostHeader) {
    // Local/LAN dev (no origin header, e.g. a raw socket handshake without a
    // browser Origin) is always plain http; the deployed host sets
    // PUBLIC_BASE_URL instead of ever relying on this branch.
    return `http://${hostHeader}`;
  }

  // No env, no headers at all — fail toward a value that still forms a
  // syntactically valid URL rather than throwing mid-room-creation.
  return "http://localhost";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/** `${origin}/join/${code}` with no double slash and no trailing slash. */
export function buildJoinUrl(origin: string, code: string): string {
  return `${stripTrailingSlash(origin)}/join/${code}`;
}

/** Encodes `joinUrl` as a PNG data URL — the QR and the shared link always carry the same string. */
export function buildQrDataUrl(joinUrl: string): Promise<string> {
  return toDataURL(joinUrl);
}
