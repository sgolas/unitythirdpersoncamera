import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sgolas.tripplanner',
  appName: 'Trip Planner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    Keyboard: {
      // Do NOT resize the web view. On edge-to-edge Android the native resize
      // fails to restore full height when the keyboard hides, leaving a blank
      // gap under forms. Instead the web view stays full-screen at all times
      // and we lift the form sheet above the keyboard using a --kb CSS var
      // (see the keyboard listeners in main.tsx and the Sheet component).
      resize: 'none' as any,
    },
    CapacitorUpdater: {
      // Self-managed OTA: the app checks our own manifest and downloads new
      // web bundles itself (see src/lib/ota.ts). Capgo's built-in auto-update
      // server is disabled. resetWhenUpdate returns to the built-in bundle
      // when a fresh APK is installed.
      autoUpdate: false,
      resetWhenUpdate: true,
    },
  },
};

export default config;
