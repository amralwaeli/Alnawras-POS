import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Lists every built file in precache.json so the service worker can keep the
// whole app (all lazy-loaded screens) on the device for offline use.
function precacheList() {
  return {
    name: 'precache-list',
    apply: 'build' as const,
    generateBundle(_: unknown, bundle: Record<string, unknown>) {
      const files = Object.keys(bundle).filter(f => f.startsWith('assets/'))
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) })
    },
  }
}

export default defineConfig({
  base: '/Alnawras-POS/',
  build: {
    outDir: 'docs',
  },
  plugins: [
    figmaAssetResolver(),
    precacheList(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
