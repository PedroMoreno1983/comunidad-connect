import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'https://conviveconnect.com';

const config: CapacitorConfig = {
  appId: 'com.conviveconnect.app',
  appName: 'Convive Connect',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://')
  }
};

export default config;
