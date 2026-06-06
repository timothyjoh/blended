// @ts-check
import { defineConfig, envField } from 'astro/config'
import react from '@astrojs/react'
import mdx from '@astrojs/mdx'
import tailwindcss from '@tailwindcss/vite'
import vercel from '@astrojs/vercel'

// https://astro.build/config
export default defineConfig({
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Ensure a single React instance is served to client islands; otherwise
      // hook dispatch resolves against a second copy and throws
      // "Invalid hook call" during hydration (affects every React island that
      // uses hooks, including InstantDB's `db.useQuery`).
      dedupe: ['react', 'react-dom'],
    },
  },
  output: 'server',
  adapter: vercel(),
  env: {
    schema: {
      PUBLIC_INSTANTDB_APP_ID: envField.string({
        context: 'client',
        access: 'public',
      }),
    },
  },
})
