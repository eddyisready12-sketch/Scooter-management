import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveCommitSha() {
  const envCommit =
    process.env.CF_PAGES_COMMIT_SHA
    || process.env.GITHUB_SHA
    || process.env.COMMIT_REF
    || '';
  if (envCommit.trim()) {
    return envCommit.trim().slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'onbekend';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_COMMIT_SHA__: JSON.stringify(resolveCommitSha()),
  },
});
