/**
 * Utility functions to mask sensitive data for display
 */

/**
 * Masks CNP - shows only first 3 and last 2 digits
 * Example: 1234567890123 -> 123********23
 */
export function maskCNP(cnp: string | null | undefined): string {
  if (!cnp || cnp.length !== 13) return cnp || '';
  return `${cnp.substring(0, 3)}${'*'.repeat(8)}${cnp.substring(11)}`;
}

/**
 * Masks address - shows only first part and last part
 * Example: "Str. Exemplu, Nr. 10, București" -> "Str. Exemplu, Nr. 10, ***"
 */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return '';
  
  // Try to keep street and number, mask city
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    // Keep first part (street), mask the rest
    return `${parts[0]}, ${'*'.repeat(Math.min(parts[1].length, 20))}`;
  }
  
  // If simple address, mask last part
  const words = address.split(' ');
  if (words.length > 2) {
    return `${words.slice(0, 2).join(' ')} ${'*'.repeat(10)}`;
  }
  
  return address;
}

/**
 * Masks phone number - shows only first 3 and last 2 digits
 * Example: 0712345678 -> 071******78
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.length < 6) return phone;
  return `${phone.substring(0, 3)}${'*'.repeat(phone.length - 5)}${phone.substring(phone.length - 2)}`;
}

/**
 * Masks email - shows only first part before @
 * Example: user@example.com -> use***@example.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 3) return email;
  return `${local.substring(0, 3)}${'*'.repeat(Math.max(0, local.length - 3))}@${domain}`;
}

