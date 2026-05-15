import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Biometric (or device PIN) gate.
 *
 * Used on every cold launch AFTER tokens are restored from SecureStore and
 * BEFORE the Dashboard renders.  If the device has no biometric hardware or
 * the user hasn't enrolled any, we transparently skip the prompt — this is
 * deliberately a soft gate, not a hard requirement, so the app remains
 * usable on emulators and on devices set up without a screen lock.
 *
 * The prompt itself uses the OS sheet (`authenticateAsync`) and allows the
 * device-PIN fallback so the user is never locked out by a moist or dirty
 * finger.
 *
 * Return values:
 *   "ok"          — user authenticated successfully (or auth was waived).
 *   "unavailable" — device has no biometric hardware or no enrolled creds.
 *                   App should proceed without re-prompting.
 *   "denied"      — user explicitly cancelled or failed.  Caller decides
 *                   whether to retry or force re-login.
 */
export type BiometricResult = 'ok' | 'unavailable' | 'denied';

export async function requireBiometric(
  promptMessage = 'Unlock Admin Console',
): Promise<BiometricResult> {
  let hasHw = false;
  let enrolled = false;
  try {
    hasHw = await LocalAuthentication.hasHardwareAsync();
    enrolled = await LocalAuthentication.isEnrolledAsync();
  } catch {
    return 'unavailable';
  }

  if (!hasHw || !enrolled) return 'unavailable';

  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // We WANT the device PIN/password as a fallback if the fingerprint
      // sensor fails repeatedly. Setting this to false would force only
      // biometric, which the user explicitly didn't ask for.
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
      // The whole point of this gate is "are you still the rightful user
      // of this phone", so we are fine with fallback auth like PIN.
    });
    return r.success ? 'ok' : 'denied';
  } catch {
    // The expo-local-authentication implementation can throw on certain
    // devices when no enrolled biometrics are found despite isEnrolled
    // returning true (Android quirk on some manufacturers). Treat as
    // unavailable rather than denied so we don't lock the user out.
    return 'unavailable';
  }
}
