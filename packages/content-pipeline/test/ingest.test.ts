/**
 * Tests for content ingestion functionality.
 *
 * Tests slug generation, duplicate detection, and file parsing.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ingest, checkDuplicateSlugs, type IngestedPost } from '../src/ingest.js';

// Test fixtures directory
const TEST_FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');
const TEST_CONTENT_DIR = path.join(TEST_FIXTURES_DIR, 'content');

// Setup test fixtures
beforeAll(() => {
  // Create fixtures directory structure
  fs.mkdirSync(path.join(TEST_CONTENT_DIR, 'nested', 'deep'), { recursive: true });

  // Create valid test posts
  fs.writeFileSync(
    path.join(TEST_CONTENT_DIR, 'simple-post.md'),
    `---
title: "Simple Post"
description: "A simple test post"
pubDate: 2024-01-15
---

This is the content of a simple post.
`
  );

  fs.writeFileSync(
    path.join(TEST_CONTENT_DIR, 'Post With Spaces.md'),
    `---
title: "Post With Spaces"
description: "A post with spaces in filename"
pubDate: 2024-02-20
tags: ["test", "spaces"]
---

Content here.
`
  );

  fs.writeFileSync(
    path.join(TEST_CONTENT_DIR, 'nested', 'nested-post.md'),
    `---
title: "Nested Post"
description: "A nested post"
pubDate: 2024-03-10
---

Nested content.
`
  );

  fs.writeFileSync(
    path.join(TEST_CONTENT_DIR, 'nested', 'deep', 'deeply-nested.md'),
    `---
title: "Deeply Nested"
description: "Very deep"
pubDate: 2024-04-01
---

Deep content.
`
  );

  // Create post with special characters in filename
  fs.writeFileSync(
    path.join(TEST_CONTENT_DIR, "Special_Chars & Stuff!.md"),
    `---
title: "Special Characters"
description: "Has special chars"
pubDate: 2024-05-15
---

Special content.
`
  );

  // Create post with missing required fields (invalid)
  fs.writeFileSync(
    path.join(TEST_CONTENT_DIR, 'invalid-post.md'),
    `---
title: "Missing Description"
pubDate: 2024-06-01
---

This post is missing description field.
`
  );
});

// Cleanup test fixtures
afterAll(() => {
  fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
});

describe('ingest', () => {
  describe('slug generation', () => {
    test('generates simple slug from filename', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      const simplePost = result.posts.find((p) => p.frontmatter.title === 'Simple Post');

      expect(simplePost).toBeDefined();
      expect(simplePost!.slug).toBe('simple-post');
    });

    test('converts spaces to dashes', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      const spacesPost = result.posts.find((p) => p.frontmatter.title === 'Post With Spaces');

      expect(spacesPost).toBeDefined();
      expect(spacesPost!.slug).toBe('post-with-spaces');
    });

    test('handles nested directory paths', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      const nestedPost = result.posts.find((p) => p.frontmatter.title === 'Nested Post');

      expect(nestedPost).toBeDefined();
      expect(nestedPost!.slug).toBe('nested/nested-post');
    });

    test('handles deeply nested directory paths', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      const deepPost = result.posts.find((p) => p.frontmatter.title === 'Deeply Nested');

      expect(deepPost).toBeDefined();
      expect(deepPost!.slug).toBe('nested/deep/deeply-nested');
    });

    test('removes special characters from slug', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      const specialPost = result.posts.find((p) => p.frontmatter.title === 'Special Characters');

      expect(specialPost).toBeDefined();
      // Special chars like & and ! should be removed, underscores converted
      expect(specialPost!.slug).toBe('specialchars--stuff');
    });

    test('converts slug to lowercase', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      // All slugs should be lowercase
      for (const post of result.posts) {
        expect(post.slug).toBe(post.slug.toLowerCase());
      }
    });
  });

  describe('file discovery', () => {
    test('finds all markdown files recursively', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      // Should find 5 valid posts + 1 invalid (6 total attempts)
      // Valid: simple-post, post-with-spaces, nested-post, deeply-nested, special-chars
      expect(result.posts.length + result.errors.length).toBe(6);
    });

    test('throws error for non-existent directory', async () => {
      await expect(ingest('/non/existent/path')).rejects.toThrow(
        'Source directory does not exist'
      );
    });
  });

  describe('error handling', () => {
    test('reports validation errors without stopping', async () => {
      const result = await ingest(TEST_CONTENT_DIR);

      // Should have at least one error (the invalid post)
      expect(result.errors.length).toBeGreaterThan(0);

      // Should still have processed valid posts
      expect(result.posts.length).toBeGreaterThan(0);
    });

    test('error message includes file path', async () => {
      const result = await ingest(TEST_CONTENT_DIR);
      const invalidError = result.errors.find((e) => e.filePath.includes('invalid-post'));

      expect(invalidError).toBeDefined();
      expect(invalidError!.error).toContain('description');
    });
  });
});

describe('checkDuplicateSlugs', () => {
  test('returns empty array when no duplicates', () => {
    const posts: IngestedPost[] = [
      {
        filePath: '/a.md',
        slug: 'post-a',
        frontmatter: {} as any,
        content: '',
        rawContent: '',
      },
      {
        filePath: '/b.md',
        slug: 'post-b',
        frontmatter: {} as any,
        content: '',
        rawContent: '',
      },
    ];

    const duplicates = checkDuplicateSlugs(posts);
    expect(duplicates).toHaveLength(0);
  });

  test('detects duplicate slugs', () => {
    const posts: IngestedPost[] = [
      {
        filePath: '/dir1/post.md',
        slug: 'same-slug',
        frontmatter: {} as any,
        content: '',
        rawContent: '',
      },
      {
        filePath: '/dir2/post.md',
        slug: 'same-slug',
        frontmatter: {} as any,
        content: '',
        rawContent: '',
      },
    ];

    const duplicates = checkDuplicateSlugs(posts);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toContain('same-slug');
    expect(duplicates[0]).toContain('/dir1/post.md');
    expect(duplicates[0]).toContain('/dir2/post.md');
  });

  test('handles multiple duplicate groups', () => {
    const posts: IngestedPost[] = [
      { filePath: '/a1.md', slug: 'slug-a', frontmatter: {} as any, content: '', rawContent: '' },
      { filePath: '/a2.md', slug: 'slug-a', frontmatter: {} as any, content: '', rawContent: '' },
      { filePath: '/b1.md', slug: 'slug-b', frontmatter: {} as any, content: '', rawContent: '' },
      { filePath: '/b2.md', slug: 'slug-b', frontmatter: {} as any, content: '', rawContent: '' },
      { filePath: '/c.md', slug: 'unique', frontmatter: {} as any, content: '', rawContent: '' },
    ];

    const duplicates = checkDuplicateSlugs(posts);
    expect(duplicates).toHaveLength(2);
  });

  test('handles empty post list', () => {
    const duplicates = checkDuplicateSlugs([]);
    expect(duplicates).toHaveLength(0);
  });
});
