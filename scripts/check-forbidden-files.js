#!/usr/bin/env node
/**
 * Pre-commit hook script to prevent committing sensitive or unwanted files.
 *
 * This script is run by lint-staged before each commit.
 * It checks staged files against forbidden patterns and blocks the commit
 * if any matches are found.
 *
 * Usage: node scripts/check-forbidden-files.js <file1> <file2> ...
 */

import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
  // Claude Code session state files
  /CLAUDE_SESSION_STATE\.md$/,

  // Environment files (except example)
  /\.env$/,
  /\.env\.[^e]/, // .env.local, .env.production, etc. but not .env.example

  // Credentials and secrets
  /credentials\.json$/,
  /secrets\.json$/,
  /\.pem$/,
  /\.key$/,

  // AWS credentials
  /aws-credentials/,

  // IDE-specific files that shouldn't be committed
  /\.idea\//,
  /\.vscode\/settings\.json$/,
];

// Secret patterns to scan for in file contents
const SECRET_PATTERNS = [
  // AWS Access Keys
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key ID' },
  { pattern: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/, name: 'AWS Secret Access Key' },

  // Generic API keys and tokens
  { pattern: /['"]sk-[A-Za-z0-9]{32,}['"]/, name: 'OpenAI/Anthropic API Key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/, name: 'GitHub Personal Access Token' },
  { pattern: /gho_[A-Za-z0-9]{36}/, name: 'GitHub OAuth Token' },

  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, name: 'Private Key' },

  // Generic secrets (high-entropy strings assigned to suspicious variable names)
  { pattern: /(?:password|secret|token|api_key|apikey)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/, name: 'Potential Secret Assignment' },
];

// File extensions to scan for secrets (skip binaries and large files)
const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.md', '.env', '.sh', '.astro'];

const files = process.argv.slice(2);

if (files.length === 0) {
  // No files to check
  process.exit(0);
}

// Check 1: Forbidden file patterns
const forbidden = files.filter((file) =>
  FORBIDDEN_PATTERNS.some((pattern) => pattern.test(file))
);

if (forbidden.length > 0) {
  console.error('\x1b[31m%s\x1b[0m', 'Pre-commit hook blocked:');
  console.error('\x1b[31m%s\x1b[0m', 'Forbidden files detected in commit:');
  console.error('');
  forbidden.forEach((f) => console.error(`  - ${f}`));
  console.error('');
  console.error(
    'These files should not be committed. Please remove them from staging:'
  );
  console.error('  git reset HEAD <file>');
  console.error('');
  console.error('If this is intentional, you can bypass with:');
  console.error('  git commit --no-verify');
  process.exit(1);
}

// Check 2: Scan file contents for secrets
const secretFindings = [];

for (const file of files) {
  const ext = path.extname(file).toLowerCase();

  // Skip non-scannable files
  if (!SCANNABLE_EXTENSIONS.includes(ext)) continue;

  // Skip files that don't exist (deleted files in staging)
  if (!fs.existsSync(file)) continue;

  try {
    const content = fs.readFileSync(file, 'utf8');

    // Skip large files (> 1MB)
    if (content.length > 1024 * 1024) continue;

    for (const { pattern, name } of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        secretFindings.push({ file, secretType: name });
      }
    }
  } catch (err) {
    // Skip files we can't read (binary, permissions, etc.)
    continue;
  }
}

if (secretFindings.length > 0) {
  console.error('\x1b[31m%s\x1b[0m', 'Pre-commit hook blocked:');
  console.error('\x1b[31m%s\x1b[0m', 'Potential secrets detected in commit:');
  console.error('');
  secretFindings.forEach(({ file, secretType }) => {
    console.error(`  - ${file}: ${secretType}`);
  });
  console.error('');
  console.error('If these are false positives, you can:');
  console.error('  1. Use environment variables instead of hardcoded values');
  console.error('  2. Add to .gitignore if the file should not be tracked');
  console.error('  3. Bypass with: git commit --no-verify (use with caution!)');
  process.exit(1);
}

// All files passed
process.exit(0);
