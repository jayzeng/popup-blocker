import { BlockedSite } from '../types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

export function maskHostname(hostname: string): string {
  return hostname.replace(/[^.]/g, '*');
}

export function findBlockedSite(sites: BlockedSite[], hostname: string): BlockedSite | undefined {
  const normalized = normalizeHostname(hostname);
  return sites.find((site) => normalizeHostname(site.hostname) === normalized);
}

export function sanitizeBlockedSites(value: unknown): BlockedSite[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((site): BlockedSite | null => {
      if (!isObjectRecord(site) || typeof site.hostname !== 'string') {
        return null;
      }

      const normalizedHostname = normalizeHostname(site.hostname);
      if (!normalizedHostname) {
        return null;
      }

      const blockedCount =
        typeof site.blockedCount === 'number' && Number.isFinite(site.blockedCount) && site.blockedCount >= 0
          ? Math.floor(site.blockedCount)
          : 0;

      return {
        hostname: normalizedHostname,
        isBlocked: site.isBlocked !== false,
        blockedCount,
        isMasked: site.isMasked === true,
      };
    })
    .filter((site): site is BlockedSite => site !== null);
}
