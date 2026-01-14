import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IngestedPost } from './ingest.js';

export interface ProcessResult {
  processed: { slug: string; outputPath: string }[];
  errors: { slug: string; error: string }[];
}

/**
 * Default output directory for processed posts.
 */
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'packages/site/src/content/blog');

/**
 * Reconstructs a markdown file with frontmatter.
 */
function serializePost(post: IngestedPost): string {
  const frontmatter = [
    '---',
    `title: "${post.frontmatter.title.replace(/"/g, '\\"')}"`,
    `description: "${post.frontmatter.description.replace(/"/g, '\\"')}"`,
    `pubDate: ${post.frontmatter.pubDate.toISOString().split('T')[0]}`,
  ];

  if (post.frontmatter.updatedDate) {
    frontmatter.push(`updatedDate: ${post.frontmatter.updatedDate.toISOString().split('T')[0]}`);
  }

  if (post.frontmatter.heroImage) {
    frontmatter.push(`heroImage: "${post.frontmatter.heroImage}"`);
  }

  if (post.frontmatter.draft) {
    frontmatter.push('draft: true');
  }

  if (post.frontmatter.tags.length > 0) {
    frontmatter.push(`tags: [${post.frontmatter.tags.map((t) => `"${t}"`).join(', ')}]`);
  }

  if (post.frontmatter.author) {
    frontmatter.push(`author: "${post.frontmatter.author}"`);
  }

  if (post.frontmatter.visibility !== 'public') {
    frontmatter.push(`visibility: "${post.frontmatter.visibility}"`);
  }

  if (post.frontmatter.campaignId) {
    frontmatter.push(`campaignId: "${post.frontmatter.campaignId}"`);
  }

  if (post.frontmatter.contributors.length > 0) {
    frontmatter.push(
      `contributors: [${post.frontmatter.contributors.map((c) => `"${c}"`).join(', ')}]`
    );
  }

  frontmatter.push('---');

  return `${frontmatter.join('\n')}\n\n${post.content}`;
}

/**
 * Resolves filename conflicts by appending a number suffix.
 */
function resolveFilenameConflict(basePath: string): string {
  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const name = path.basename(basePath, ext);

  let counter = 1;
  let newPath = basePath;

  while (fs.existsSync(newPath)) {
    newPath = path.join(dir, `${name}-${counter}${ext}`);
    counter++;
  }

  console.log(`  Resolved conflict: ${path.basename(basePath)} -> ${path.basename(newPath)}`);

  return newPath;
}

/**
 * Processes ingested posts and copies them to the output directory.
 *
 * - Creates output directory if needed
 * - Serializes posts with proper frontmatter format
 * - Handles filename conflicts gracefully
 * - Extracts and processes referenced images (if any)
 */
export async function processContent(
  posts: IngestedPost[],
  outputDir: string = DEFAULT_OUTPUT_DIR
): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: [],
    errors: [],
  };

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Processing ${posts.length} post(s) to ${outputDir}`);

  for (const post of posts) {
    try {
      // Determine output path
      const filename = `${post.slug.replace(/\//g, '-')}.md`;
      let outputPath = path.join(outputDir, filename);

      // Handle conflicts
      outputPath = resolveFilenameConflict(outputPath);

      // Serialize and write
      const content = serializePost(post);
      fs.writeFileSync(outputPath, content, 'utf-8');

      result.processed.push({
        slug: post.slug,
        outputPath,
      });

      console.log(`  ✓ ${post.slug} -> ${path.basename(outputPath)}`);

      // TODO: Process referenced images
      // - Parse content for image references
      // - Copy images to public/assets
      // - Update image paths in content
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({
        slug: post.slug,
        error: errorMessage,
      });
      console.error(`  ✗ ${post.slug}: ${errorMessage}`);
    }
  }

  console.log(`\nProcessed ${result.processed.length} post(s) with ${result.errors.length} error(s)`);

  return result;
}

/**
 * Clears all existing posts from the output directory.
 * Use with caution!
 */
export function clearOutputDirectory(outputDir: string = DEFAULT_OUTPUT_DIR): void {
  if (!fs.existsSync(outputDir)) {
    return;
  }

  const files = fs.readdirSync(outputDir);

  for (const file of files) {
    if (file.endsWith('.md') && file !== '.gitkeep') {
      const filePath = path.join(outputDir, file);
      fs.unlinkSync(filePath);
      console.log(`  Removed: ${file}`);
    }
  }
}
