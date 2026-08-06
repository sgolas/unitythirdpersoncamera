export interface PasswordCheck {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export function checkPassword(pw: string): PasswordCheck {
  return {
    minLength: pw.length >= 8,
    hasUpper:  /[A-Z]/.test(pw),
    hasLower:  /[a-z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
    hasSymbol: /[^A-Za-z0-9]/.test(pw),
  };
}

export function isPasswordValid(pw: string): boolean {
  const c = checkPassword(pw);
  return c.minLength && c.hasUpper && c.hasLower && c.hasNumber && c.hasSymbol;
}

export const PASSWORD_RULES: { key: keyof PasswordCheck; label: string }[] = [
  { key: 'minLength', label: 'At least 8 characters' },
  { key: 'hasUpper',  label: 'One uppercase letter (A–Z)' },
  { key: 'hasLower',  label: 'One lowercase letter (a–z)' },
  { key: 'hasNumber', label: 'One number (0–9)' },
  { key: 'hasSymbol', label: 'One symbol (!@#$…)' },
];
