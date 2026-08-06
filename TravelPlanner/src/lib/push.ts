/**
 * Firebase push notifications (native only).
 *
 * On launch we register with FCM, hand our device token to the relay
 * (/api/pushregister, gated by the trip code + password), and listen for
 * incoming pushes. When a chat push arrives we pull sync so the message is in
 * the local DB, and tapping it jumps to the Chat tab.
 *
 * Requires the @capacitor/push-notifications plugin + a google-services.json
 * baked into the APK, so it only works in fresh native builds (not OTA). The
 * whole module no-ops gracefully when the plugin isn't present.
 */
import { isNative } from './platform';
import { getSyncCode, getSyncPass, isSyncConfigured, PUSHREGISTER_ENDPOINT } from './config';
import { chatDeviceId, setPushActive } from './chatUnread';
import { syncNow } from '../db/sync';

let lastToken = '';
let started = false;

async function registerToken(token: string) {
  if (!token || !isSyncConfigured()) return;
  try {
    await fetch(PUSHREGISTER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripCode: getSyncCode(), password: getSyncPass(),
        deviceId: chatDeviceId(), token,
      }),
    });
  } catch { /* offline — will retry on next launch / config change */ }
}

export async function initPush() {
  if (!isNative || started) return;
  started = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isPluginAvailable('PushNotifications')) return; // older APK
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Dedicated high-importance channel so chat pushes pop as heads-up alerts.
    try {
      await PushNotifications.createChannel({
        id: 'chat', name: 'Family chat', description: 'New messages from your trip',
        importance: 5, visibility: 1, sound: 'default',
      });
    } catch { /* channels are Android-only */ }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // FCM will deliver system notifications for incoming chat, so the in-app
    // fallback local notification must stand down to avoid double-notifying.
    setPushActive(true);

    PushNotifications.addListener('registration', t => { lastToken = t.value; void registerToken(t.value); });
    PushNotifications.addListener('registrationError', () => { /* no token this run */ });

    // Foreground push: pull it into the DB so the badge/banner update.
    PushNotifications.addListener('pushNotificationReceived', () => { void syncNow(); });

    // Tapped from the tray: open the chat, and make sure it's synced in.
    PushNotifications.addListener('pushNotificationActionPerformed', () => {
      void syncNow();
      window.dispatchEvent(new Event('open-chat'));
    });

    await PushNotifications.register();

    // If the trip gets configured after launch, register the token we already have.
    window.addEventListener('sync-config-changed', () => { if (lastToken) void registerToken(lastToken); });
  } catch { /* plugin unavailable in this build */ }
}
