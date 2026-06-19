import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alnawras.pos',
  appName: 'AlnawrasPOS',
  webDir: 'docs',
  server: {
    // Correct GitHub Pages URL — matches the repo owner: amralwaeli
    url: 'https://amralwaeli.github.io/Alnawras-POS/',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
