import { Capacitor } from '@capacitor/core';

/**
 * True when the app is running inside the installed native shell (the Android
 * APK / Capacitor WebView), false when it's opened in a plain web browser.
 *
 * Used to split the login flow: the website (browser) signs in with the branch
 * email+password and goes straight to the tenant admin dashboard, while the
 * installed app uses that same email+password to bind the device and then asks
 * staff for their PIN. Falls back to `false` (browser behaviour) if the
 * Capacitor bridge isn't present for any reason.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
