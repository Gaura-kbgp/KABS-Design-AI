import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of prefix, 
  // ensuring we can access VITE_API_KEY.
  // Fix: Cast process to any to avoid "Property 'cwd' does not exist on type 'Process'" error
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // This is critical: it replaces 'process.env.API_KEY' in your source code
      // with the actual string value from your .env file at build time.
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
    },
  };
});