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
      // Resize the whole web view when the keyboard opens so form fields
      // above the keyboard stay visible and scrollable.
      resize: 'native' as any,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
