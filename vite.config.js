import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // VITE_APP_MODE=demo builds the public demo (Vercel + Supabase, or any static host): no Base44 plugin, no Base44 calls.
  const demoOnly = (process.env.VITE_APP_MODE || env.VITE_APP_MODE) === 'demo';
  return {
    logLevel: 'error', // Suppress warnings, only show errors
    // The Base44 plugin adds this alias itself; demo builds need it here.
    resolve: { alias: { '@': path.join(here, 'src') } },
    plugins: [
      ...(demoOnly
        ? []
        : [
            base44({
              // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
              // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
              legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
              hmrNotifier: true,
              navigationNotifier: true,
              analyticsTracker: true,
              visualEditAgent: true,
            }),
          ]),
      react(),
    ],
  };
});
