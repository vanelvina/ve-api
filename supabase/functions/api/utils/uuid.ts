/**
 * Helper to convert a 24-character MongoDB Hex ObjectId to a valid 36-character PostgreSQL UUID.
 * Returns the input unchanged if it is already a UUID or is not a valid 24-char hex string.
 */
export function toUUID(mongoId: string | null | undefined): string | null {
  if (!mongoId) return null;
  const str = mongoId.toString().trim();
  if (str.length !== 24) return str;
  return `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20, 24)}00000000`;
}

/**
 * Helper to convert a 36-character UUID back to a 24-character MongoDB Hex ObjectId format
 * if the frontend expects MongoDB ObjectId formatted strings.
 */
export function fromUUID(uuid: string | null | undefined): string | null {
  if (!uuid) return null;
  const str = uuid.toString().trim();
  if (str.length !== 36) return str;
  // Remove hyphens and trim the padded zeros (last 8 characters)
  const noHyphens = str.replace(/-/g, '');
  return noHyphens.substring(0, 24);
}
