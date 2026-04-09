import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pedromoreno.comunidadconnect',
  appName: 'Comunidad Connect',
  webDir: 'out',
  server: {
    url: 'https://comunidadconnect.vercel.app',
    cleartext: true
  }
};

export default config;
