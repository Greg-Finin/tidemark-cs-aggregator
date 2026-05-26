/**
 * HubSpot owner ID → CSM display name.
 *
 * The warehouse-backed account row stores `CSM_OWNER` as the raw CRM owner ID;
 * this map resolves it to a human-readable name for the UI. In a deployed
 * integration this would be kept in sync with the CRM whenever the CSM team
 * changes; in the demo it's a static fixture matching the four CSMs assigned
 * across `data/accounts.json`.
 */
const CSM_BY_HUBSPOT_ID: Record<string, string> = {
  "10000001": "Greg Finin",
  "10000002": "Maya Okafor",
  "10000003": "Jordan Park",
  "10000004": "Devi Anand",
  "10000099": "Unassigned",
};

export function csmName(rawOwner: string | null | undefined): string | null {
  if (rawOwner == null) return null;
  const trimmed = String(rawOwner).trim();
  if (!trimmed) return null;
  return CSM_BY_HUBSPOT_ID[trimmed] ?? trimmed;
}

/** All known CSM display names. Used for the filter dropdown. */
export function allCsmNames(): string[] {
  return Object.values(CSM_BY_HUBSPOT_ID).filter((n) => n !== "Unassigned");
}
