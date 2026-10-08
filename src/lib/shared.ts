export function isoToDdMmYyyy(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatVisaRange(entryIso: string, stayDays: number): string {
  const validFrom = isoToDdMmYyyy(entryIso);
  const validTo = isoToDdMmYyyy(addDaysIso(entryIso, stayDays - 1));
  return `e-Visa valid: ${validFrom} → ${validTo} (${stayDays} days)`;
}

/** Map the historical leisure entry reason to the currently offered label. */
export function normalizePurposeOfEntry(value: unknown): unknown {
  return typeof value === 'string' && value.trim().toLowerCase() === 'tourism'
    ? 'Tourist'
    : value;
}

/** Only the official HTTPS Vietnam e-Visa origin may reveal stored applicant data. */
export function isEvisaSiteUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'evisa.gov.vn';
  } catch {
    return false;
  }
}

export function isForeignersUrl(url: string | undefined): boolean {
  if (!isEvisaSiteUrl(url)) return false;
  const { pathname } = new URL(url!);
  return pathname === '/e-visa/foreigners' || pathname.startsWith('/e-visa/foreigners/');
}
