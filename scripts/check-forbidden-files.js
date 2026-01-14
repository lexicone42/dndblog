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

const FORBIDDEN_CONTENT_PATTERNS = [
  // These would require reading file contents, which lint-staged doesn't do by default
  // Keeping as documentation for future enhancement
];

const files = process.argv.slice(2);

if (files.length === 0) {
  // No files to check
  process.exit(0);
}

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

// All files passed
process.exit(0);
