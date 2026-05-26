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

export function isForeignersUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith('evisa.gov.vn') && pathname.includes('/e-visa/foreigners');
  } catch {
    return url.includes('evisa.gov.vn') && url.includes('/e-visa/foreigners');
  }
}
