/**
 * Tests for content processing functionality.
 *
 * Tests post serialization, filename conflict resolution, and output generation.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { processContent, clearOutputDirectory } from '../src/process.js';
import type { IngestedPost } from '../src/ingest.js';

// Test output directory
const TEST_OUTPUT_DIR = path.join(import.meta.dirname, 'fixtures', 'output');

// Helper to create a minimal IngestedPost
function createTestPost(overrides: Partial<IngestedPost> = {}): IngestedPost {
  return {
    filePath: '/test/post.md',
    slug: 'test-post',
    frontmatter: {
      title: 'Test Post',
      description: 'A test post description',
      pubDate: new Date('2024-06-15'),
      draft: false,
      tags: [],
      visibility: 'public',
      contributors: [],
    },
    content: 'This is the post content.',
    rawContent: '---\ntitle: "Test Post"\n---\n\nThis is the post content.',
    ...overrides,
  };
}

beforeAll(() => {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(path.join(import.meta.dirname, 'fixtures'), { recursive: true, force: true });
});

beforeEach(() => {
  // Clear output directory before each test
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    const entries = fs.readdirSync(TEST_OUTPUT_DIR, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(TEST_OUTPUT_DIR, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }
});

describe('processContent', () => {
  describe('post serialization', () => {
    test('generates valid frontmatter with required fields', async () => {
      const post = createTestPost();
      await processContent([post], TEST_OUTPUT_DIR);

      const outputPath = path.join(TEST_OUTPUT_DIR, 'test-post.md');
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('title: "Test Post"');
      expect(content).toContain('description: "A test post description"');
      expect(content).toContain('pubDate: 2024-06-15');
    });

    test('escapes quotes in frontmatter values', async () => {
      const post = createTestPost({
        frontmatter: {
          ...createTestPost().frontmatter,
          title: 'Post with "quotes" inside',
          description: 'Description with "more quotes"',
        },
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).toContain('title: "Post with \\"quotes\\" inside"');
      expect(content).toContain('description: "Description with \\"more quotes\\""');
    });

    test('formats date as YYYY-MM-DD', async () => {
      const post = createTestPost({
        frontmatter: {
          ...createTestPost().frontmatter,
          pubDate: new Date('2024-12-25T10:30:00Z'),
        },
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).toContain('pubDate: 2024-12-25');
      expect(content).not.toContain('T10:30:00');
    });

    test('includes optional updatedDate when present', async () => {
      const post = createTestPost({
        frontmatter: {
          ...createTestPost().frontmatter,
          updatedDate: new Date('2024-07-20'),
        },
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).toContain('updatedDate: 2024-07-20');
    });

    test('omits optional fields when not present', async () => {
      const post = createTestPost();
      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).not.toContain('updatedDate');
      expect(content).not.toContain('heroImage');
      expect(content).not.toContain('author');
    });

    test('includes heroImage when present', async () => {
      const post = createTestPost({
        frontmatter: {
          ...createTestPost().frontmatter,
          heroImage: '/images/hero.webp',
        },
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).toContain('heroImage: "/images/hero.webp"');
    });

    test('includes draft flag only when true', async () => {
      const draftPost = createTestPost({
        slug: 'draft-post',
        frontmatter: {
          ...createTestPost().frontmatter,
          draft: true,
        },
      });

      const publishedPost = createTestPost({
        slug: 'published-post',
        frontmatter: {
          ...createTestPost().frontmatter,
          draft: false,
        },
      });

      await processContent([draftPost, publishedPost], TEST_OUTPUT_DIR);

      const draftContent = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'draft-post.md'), 'utf-8');
      const publishedContent = fs.readFileSync(
        path.join(TEST_OUTPUT_DIR, 'published-post.md'),
        'utf-8'
      );

      expect(draftContent).toContain('draft: true');
      expect(publishedContent).not.toContain('draft');
    });

    test('formats tags array correctly', async () => {
      const post = createTestPost({
        frontmatter: {
          ...createTestPost().frontmatter,
          tags: ['javascript', 'testing', 'vitest'],
        },
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).toContain('tags: ["javascript", "testing", "vitest"]');
    });

    test('omits empty tags array', async () => {
      const post = createTestPost({
        frontmatter: {
          ...createTestPost().frontmatter,
          tags: [],
        },
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).not.toContain('tags:');
    });

    test('preserves content body', async () => {
      const post = createTestPost({
        content: 'This is **markdown** content with:\n\n- Lists\n- And more',
      });

      await processContent([post], TEST_OUTPUT_DIR);

      const content = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'test-post.md'), 'utf-8');
      expect(content).toContain('This is **markdown** content with:');
      expect(content).toContain('- Lists');
      expect(content).toContain('- And more');
    });

    test('includes visibility only when not public', async () => {
      const privatePost = createTestPost({
        slug: 'private-post',
        frontmatter: {
          ...createTestPost().frontmatter,
          visibility: 'private',
        },
      });

      const publicPost = createTestPost({
        slug: 'public-post',
        frontmatter: {
          ...createTestPost().frontmatter,
          visibility: 'public',
        },
      });

      await processContent([privatePost, publicPost], TEST_OUTPUT_DIR);

      const privateContent = fs.readFileSync(
        path.join(TEST_OUTPUT_DIR, 'private-post.md'),
        'utf-8'
      );
      const publicContent = fs.readFileSync(path.join(TEST_OUTPUT_DIR, 'public-post.md'), 'utf-8');

      expect(privateContent).toContain('visibility: "private"');
      expect(publicContent).not.toContain('visibility');
    });
  });

  describe('filename handling', () => {
    test('converts slug slashes to dashes in filename', async () => {
      const post = createTestPost({
        slug: 'nested/path/to/post',
      });

      await processContent([post], TEST_OUTPUT_DIR);

      expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'nested-path-to-post.md'))).toBe(true);
    });

    test('resolves filename conflicts with numeric suffix', async () => {
      // Create existing file
      fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'conflict.md'), 'existing');

      const post = createTestPost({
        slug: 'conflict',
      });

      await processContent([post], TEST_OUTPUT_DIR);

      // Should create conflict-1.md
      expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'conflict-1.md'))).toBe(true);
    });

    test('handles multiple conflicts', async () => {
      // Create existing files
      fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'multi.md'), 'first');
      fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'multi-1.md'), 'second');

      const post = createTestPost({
        slug: 'multi',
      });

      await processContent([post], TEST_OUTPUT_DIR);

      // Should create multi-2.md
      expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'multi-2.md'))).toBe(true);
    });
  });

  describe('result tracking', () => {
    test('returns processed posts with output paths', async () => {
      const posts = [createTestPost({ slug: 'post-a' }), createTestPost({ slug: 'post-b' })];

      const result = await processContent(posts, TEST_OUTPUT_DIR);

      expect(result.processed).toHaveLength(2);
      expect(result.processed[0].slug).toBe('post-a');
      expect(result.processed[0].outputPath).toContain('post-a.md');
      expect(result.processed[1].slug).toBe('post-b');
    });

    test('returns empty errors for successful processing', async () => {
      const post = createTestPost();
      const result = await processContent([post], TEST_OUTPUT_DIR);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('directory management', () => {
    test('creates output directory if it does not exist', async () => {
      const newDir = path.join(TEST_OUTPUT_DIR, 'new-subdir');
      const post = createTestPost();

      await processContent([post], newDir);

      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.existsSync(path.join(newDir, 'test-post.md'))).toBe(true);
    });
  });
});

describe('clearOutputDirectory', () => {
  test('removes markdown files from directory', () => {
    // Create test files
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'post1.md'), 'content');
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'post2.md'), 'content');

    clearOutputDirectory(TEST_OUTPUT_DIR);

    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'post1.md'))).toBe(false);
    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'post2.md'))).toBe(false);
  });

  test('preserves non-markdown files', () => {
    // Create test files
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'post.md'), 'content');
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'image.png'), 'image');

    clearOutputDirectory(TEST_OUTPUT_DIR);

    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'post.md'))).toBe(false);
    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'image.png'))).toBe(true);
  });

  test('preserves .gitkeep file', () => {
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, '.gitkeep'), '');
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, 'post.md'), 'content');

    clearOutputDirectory(TEST_OUTPUT_DIR);

    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, '.gitkeep'))).toBe(true);
  });

  test('handles non-existent directory gracefully', () => {
    expect(() => clearOutputDirectory('/non/existent/path')).not.toThrow();
  });
});
