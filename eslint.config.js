import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.wrangler` holds generated bundles from `wrangler dev` — build output, not source.
  globalIgnores(['dist', 'worker/.wrangler']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // The Worker runs on Cloudflare, not in a page: different globals, and the
    // React Fast Refresh rule has nothing to say about a default-exported
    // fetch handler.
    files: ['worker/**/*.js'],
    languageOptions: { globals: globals.worker },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
