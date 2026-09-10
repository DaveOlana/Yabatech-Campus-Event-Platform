/**
 * Matric number normalization and validation utilities.
 *
 * Rules (Frozen in DECISIONS.md and Milestone 1B specification):
 * - Trim leading/trailing whitespace.
 * - Convert alphabetic characters to uppercase.
 * - Normalize harmless whitespace around separators (e.g. "F / ND / 24 / 3210051" -> "F/ND/24/3210051").
 * - Validate against pattern: ^[A-Z]{1,4}/[A-Z]{2,4}/\d{2}/\d{7}$
 *   (PREFIX/PROGRAMME/YEAR/SERIAL, e.g. F/ND/24/3210051, PT/HND/25/2100001).
 */

export const MATRIC_NUMBER_REGEX = /^[A-Z]{1,4}\/[A-Z]{2,4}\/\d{2}\/\d{7}$/;

/**
 * Normalizes user-entered matric number according to YCEP rules.
 */
export function normalizeMatricNumber(matric: string): string {
  if (!matric) return "";
  return matric.trim().toUpperCase().replace(/\s*\/\s*/g, "/");
}

/**
 * Validates whether a matric number matches the structural format.
 */
export function isValidMatricNumber(matric: string): boolean {
  const normalized = normalizeMatricNumber(matric);
  return MATRIC_NUMBER_REGEX.test(normalized);
}
