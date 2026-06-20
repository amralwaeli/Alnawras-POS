/**
 * NotificationService.ts
 *
 * Thin wrapper over @capacitor/local-notifications. Fires native notifications
 * inside the APK (waiter calls, new pickup orders). On the web it is a no-op.
 *
 * Note: local notifications fire while the app is running (foreground or
 * recently backgrounded). True notifications when the app is fully closed would
 * require push (FCM) + a server, which is a separate, larger setup.
 */
let counter = 1;

function isNative(): boolean {
  const cap: any = (window as any).Capacitor;
  return !!cap && (typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : true);
}

export const NotificationService = {
  /** Ask for notification permission once (Android 13+ requires it). */
  async init(): Promise<void> {
    if (!isNative()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch (err) {
      console.warn('[NotificationService] init failed', err);
    }
  },

  /** Show an immediate local notification. */
  async notify(title: string, body: string): Promise<void> {
    if (!isNative()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [{
          id: (Date.now() % 2000000000) + (counter++ % 1000),
          title,
          body,
          schedule: { at: new Date(Date.now() + 150) },
        }],
      });
    } catch (err) {
      console.warn('[NotificationService] notify failed', err);
    }
  },
};
