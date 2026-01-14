/**
 * Tests for frontmatter schema validation.
 *
 * Tests required fields, optional fields, type coercion, and error messages.
 */

import { describe, test, expect } from 'vitest';
import { validateFrontmatter, frontmatterSchema } from '../src/schema.js';

describe('frontmatterSchema', () => {
  describe('required fields', () => {
    test('validates complete valid frontmatter', () => {
      const data = {
        title: 'Test Post',
        description: 'A test description',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Test Post');
        expect(result.data.description).toBe('A test description');
        expect(result.data.pubDate).toBeInstanceOf(Date);
      }
    });

    test('rejects missing title', () => {
      const data = {
        description: 'A test description',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('rejects empty title', () => {
      const data = {
        title: '',
        description: 'A test description',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('rejects missing description', () => {
      const data = {
        title: 'Test Post',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('rejects missing pubDate', () => {
      const data = {
        title: 'Test Post',
        description: 'A test description',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('date coercion', () => {
    test('coerces string date to Date object', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-06-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pubDate).toBeInstanceOf(Date);
        // Use UTC methods to avoid timezone issues
        expect(result.data.pubDate.getUTCFullYear()).toBe(2024);
        expect(result.data.pubDate.getUTCMonth()).toBe(5); // 0-indexed
        expect(result.data.pubDate.getUTCDate()).toBe(15);
      }
    });

    test('coerces ISO datetime string', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-06-15T10:30:00Z',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pubDate).toBeInstanceOf(Date);
      }
    });

    test('coerces Date object', () => {
      const date = new Date('2024-06-15');
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: date,
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pubDate).toBeInstanceOf(Date);
      }
    });

    test('rejects invalid date string', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: 'not-a-date',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    test('accepts optional updatedDate', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        updatedDate: '2024-02-20',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.updatedDate).toBeInstanceOf(Date);
      }
    });

    test('accepts optional heroImage', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        heroImage: '/images/hero.jpg',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.heroImage).toBe('/images/hero.jpg');
      }
    });

    test('accepts optional author', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        author: 'John Doe',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.author).toBe('John Doe');
      }
    });
  });

  describe('default values', () => {
    test('draft defaults to false', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.draft).toBe(false);
      }
    });

    test('tags defaults to empty array', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual([]);
      }
    });

    test('visibility defaults to public', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe('public');
      }
    });

    test('contributors defaults to empty array', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contributors).toEqual([]);
      }
    });
  });

  describe('array fields', () => {
    test('accepts tags array', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        tags: ['javascript', 'testing', 'vitest'],
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(['javascript', 'testing', 'vitest']);
      }
    });

    test('accepts contributors array', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        contributors: ['Alice', 'Bob'],
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contributors).toEqual(['Alice', 'Bob']);
      }
    });
  });

  describe('visibility enum', () => {
    test('accepts public visibility', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        visibility: 'public',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('accepts private visibility', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        visibility: 'private',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('accepts campaign visibility', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        visibility: 'campaign',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('rejects invalid visibility', () => {
      const data = {
        title: 'Test',
        description: 'Test',
        pubDate: '2024-01-15',
        visibility: 'invalid',
      };

      const result = frontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe('validateFrontmatter', () => {
  test('returns parsed data on success', () => {
    const data = {
      title: 'Valid Post',
      description: 'A valid post',
      pubDate: '2024-01-15',
    };

    const result = validateFrontmatter(data, '/test/path.md');
    expect(result.title).toBe('Valid Post');
    expect(result.pubDate).toBeInstanceOf(Date);
  });

  test('throws descriptive error on failure', () => {
    const data = {
      title: 'Missing Description',
      pubDate: '2024-01-15',
    };

    expect(() => validateFrontmatter(data, '/test/invalid.md')).toThrow(
      /Invalid frontmatter in \/test\/invalid\.md/
    );
  });

  test('error message includes field path', () => {
    const data = {
      title: 'Missing Description',
      pubDate: '2024-01-15',
    };

    expect(() => validateFrontmatter(data, '/test/invalid.md')).toThrow(/description/);
  });

  test('error message includes file path', () => {
    const data = {};

    expect(() => validateFrontmatter(data, '/specific/file/path.md')).toThrow(
      '/specific/file/path.md'
    );
  });
});
