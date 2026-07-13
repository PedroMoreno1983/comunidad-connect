import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pedromoreno.comunidadconnect',
  appName: 'Comunidad Connect',
  webDir: 'out',
  server: {
    url: 'https://conviveconnect.com',
    cleartext: false
  }
};

export default config;
