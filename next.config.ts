import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensure node:sqlite (Node 22 built-in) is treated as an external,
  // not bundled by webpack — required for the Codex SQLite reader.
  serverExternalPackages: ['node:sqlite'],
};

export default nextConfig;
