export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone.replace(/\s/g, ''));
}

export function isValidOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}
