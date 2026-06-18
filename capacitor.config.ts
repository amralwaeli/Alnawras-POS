import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alnawras.pos',
  appName: 'AlnawrasPOS',
  webDir: 'docs',
  server: {
    // Point this to your hosted web URL (GitHub Pages)
    // This allows the app to load the latest code every time it starts
    url: 'https://alnawras-rest.github.io/Alnawras-POS/',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
