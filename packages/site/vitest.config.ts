import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    // Use happy-dom for DOM simulation
    environment: 'happy-dom',

    // Include test files
    include: ['src/**/*.{test,spec}.{js,ts}'],

    // Snapshot settings
    snapshotFormat: {
      printBasicPrototype: false,
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/components/**/*.astro'],
      exclude: ['node_modules', 'dist'],
    },
  },
});
