const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Monorepo root is two levels up from apps/mobile
const monorepoRoot = path.resolve(__dirname, '../..');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Ensure packages/types resolves correctly
    extraNodeModules: {
      '@apex/types': path.resolve(monorepoRoot, 'packages/types/src'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
