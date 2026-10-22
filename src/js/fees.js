// Membership pricing, shared by the application form and the server so
// the total a member sees is exactly what Square charges.

export const MEMBERSHIP = { "New Membership": 2000, "Membership Renewal": 2000 }; // cents
export const CHAPTERS = { Crozet: 500, "Grateful Threads": 1000, Modern: 1000, Moonlighters: 500, Nelson: 1000, None: 0 };

// Square charges 2.9% + 30¢. The fee is grossed up so the Guild and
// chapters receive the full membership amount (same formula as the old form).
export function processingFee(baseCents) {
  if (baseCents <= 0) return 0;
  return Math.ceil((baseCents + 30) / (1 - 0.029) - baseCents - 1e-9);
}

export function membershipTotal(membership, chapters = []) {
  const base = (MEMBERSHIP[membership] || 0) + chapters.reduce((sum, c) => sum + (CHAPTERS[c] || 0), 0);
  const fee = processingFee(base);
  return { base, fee, total: base + fee };
}

export const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
