/**
 * Current-location helper. Uses the Capacitor Geolocation plugin on device
 * (with an explicit permission request so Android shows its allow dialog) and
 * falls back to the browser's navigator.geolocation on the web portal.
 *
 * Always resolves to { lat, lng } or throws an Error with a friendly, and
 * actionable, message so the UI can tell the user exactly what to do.
 */
import { Capacitor } from '@capacitor/core';

export interface LatLng { lat: number; lng: number }

// Accept a recent OS-cached fix (2 min) so the first answer comes back fast.
const OPTS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 };

export async function getCurrentLocation(): Promise<LatLng> {
  // Native (Android/iOS) path — request permission first, then read position.
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')) {
    const { Geolocation } = await import('@capacitor/geolocation');
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      }
      if (perm.location === 'denied' && perm.coarseLocation === 'denied') {
        throw new Error('Location permission is off. Enable it for Trip Planner in your phone’s Settings → Apps → Permissions.');
      }
      const pos = await Geolocation.getCurrentPosition(OPTS);
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) {
      if (e instanceof Error && /permission/i.test(e.message)) throw e;
      throw new Error('Couldn’t get your location. Make sure location/GPS is turned on and try again.');
    }
  }

  // Web path — browser geolocation.
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise<LatLng>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        err => reject(new Error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was blocked. Allow it in your browser’s site settings.'
            : 'Couldn’t get your location — is GPS/location on?'
        )),
        OPTS,
      );
    });
  }

  throw new Error('Location isn’t available on this device.');
}
