import { defineConfig } from 'vitest/config'

// The vendored @sawaswap packages ship their own tests, compiled against the
// build they install with (dist/test imports ../src/*.js). Running them here
// tests the artefact the Console actually loads, not a source it never sees.
export default defineConfig({
  test: {
    include: ['node_modules/@sawaswap/*/dist/test/**/*.test.js'],
    exclude: [],
    environment: 'node',
  },
})
