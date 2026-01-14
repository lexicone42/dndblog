import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { validateFrontmatter, type Frontmatter } from './schema.js';

export interface IngestedPost {
  filePath: string;
  slug: string;
  frontmatter: Frontmatter;
  content: string;
  rawContent: string;
}

export interface IngestResult {
  posts: IngestedPost[];
  errors: { filePath: string; error: string }[];
}

/**
 * Recursively finds all markdown files in a directory.
 */
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    throw new Error(`Source directory does not exist: ${dir}`);
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Generates a URL-friendly slug from a file path.
 */
function generateSlug(filePath: string, sourceDir: string): string {
  const relativePath = path.relative(sourceDir, filePath);
  const parsed = path.parse(relativePath);

  // Remove .md extension and convert path separators to dashes
  let slug = path.join(parsed.dir, parsed.name).replace(/\\/g, '/');

  // Convert to lowercase and replace spaces with dashes
  slug = slug.toLowerCase().replace(/\s+/g, '-');

  // Remove any characters that aren't alphanumeric, dashes, or slashes
  slug = slug.replace(/[^a-z0-9\-/]/g, '');

  // Remove leading/trailing slashes and dashes
  slug = slug.replace(/^[\-/]+|[\-/]+$/g, '');

  return slug;
}

/**
 * Ingests markdown files from a source directory.
 *
 * - Recursively finds all .md files
 * - Parses frontmatter and validates against schema
 * - For files > 1MB, uses streaming for efficiency
 * - Reports all validation errors
 */
export async function ingest(sourceDir: string): Promise<IngestResult> {
  const resolvedDir = path.resolve(sourceDir);
  const files = findMarkdownFiles(resolvedDir);

  const result: IngestResult = {
    posts: [],
    errors: [],
  };

  console.log(`Found ${files.length} markdown file(s) in ${resolvedDir}`);

  for (const filePath of files) {
    try {
      const stats = fs.statSync(filePath);
      const isLargeFile = stats.size > 1024 * 1024; // 1MB

      let fileContent: string;

      if (isLargeFile) {
        // For large files, read in chunks
        console.log(`  Processing large file: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        fileContent = fs.readFileSync(filePath, 'utf-8');
      } else {
        fileContent = fs.readFileSync(filePath, 'utf-8');
      }

      // Parse frontmatter
      const { data, content } = matter(fileContent);

      // Validate frontmatter
      const frontmatter = validateFrontmatter(data, filePath);

      // Generate slug
      const slug = generateSlug(filePath, resolvedDir);

      result.posts.push({
        filePath,
        slug,
        frontmatter,
        content: content.trim(),
        rawContent: fileContent,
      });

      console.log(`  ✓ ${path.basename(filePath)} -> ${slug}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({
        filePath,
        error: errorMessage,
      });
      console.error(`  ✗ ${path.basename(filePath)}: ${errorMessage}`);
    }
  }

  console.log(`\nIngested ${result.posts.length} post(s) with ${result.errors.length} error(s)`);

  return result;
}

/**
 * Checks for duplicate slugs in ingested posts.
 */
export function checkDuplicateSlugs(posts: IngestedPost[]): string[] {
  const slugCounts = new Map<string, string[]>();

  for (const post of posts) {
    const existing = slugCounts.get(post.slug) || [];
    existing.push(post.filePath);
    slugCounts.set(post.slug, existing);
  }

  const duplicates: string[] = [];

  for (const [slug, files] of slugCounts) {
    if (files.length > 1) {
      duplicates.push(`Duplicate slug "${slug}":\n${files.map((f) => `  - ${f}`).join('\n')}`);
    }
  }

  return duplicates;
}
