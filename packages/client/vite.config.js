import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Determine the root directory of the project (one level up from this config file)
  const projectRoot = path.resolve(__dirname, '..', '..')

  // Load environment variables from .env file in the project root
  const env = loadEnv(mode, projectRoot, 'VITE_')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Proxy API requests to Express
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false
        }
      }
    },
    define: {
      // Expose environment variables to the client-side code
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    }
  }
})
