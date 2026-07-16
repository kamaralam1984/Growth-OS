export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

/**
 * Simple heuristic password strength scorer — no external dependency.
 * Considers length and character-class variety. Purely a UX hint; the real
 * enforcement is registerSchema (min 8 chars + at least one number).
 */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: LABELS[0] };
  }

  let points = 0;

  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;

  const varietyChecks = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const varietyCount = varietyChecks.filter(Boolean).length;
  if (varietyCount >= 2) points += 1;
  if (varietyCount >= 3) points += 1;
  if (varietyCount >= 4) points += 1;

  // Penalize very short passwords regardless of variety.
  if (password.length < 6) points = 0;

  const score = Math.max(0, Math.min(4, points)) as 0 | 1 | 2 | 3 | 4;

  return { score, label: LABELS[score] };
}
