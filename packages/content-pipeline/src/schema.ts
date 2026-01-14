import { z } from 'zod';

/**
 * Schema for blog post frontmatter validation.
 * Matches the Astro content collection schema in packages/site/src/content.config.ts
 */
export const frontmatterSchema = z.object({
  // Required fields
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  pubDate: z.coerce.date(),

  // Optional fields
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  draft: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  author: z.string().optional(),

  // Future Phase 2 fields
  visibility: z.enum(['public', 'private', 'campaign']).default('public'),
  campaignId: z.string().optional(),
  contributors: z.array(z.string()).default([]),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/**
 * Validates frontmatter data against the schema.
 * Returns parsed data on success or throws a descriptive error.
 */
export function validateFrontmatter(data: unknown, filePath: string): Frontmatter {
  const result = frontmatterSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid frontmatter in ${filePath}:\n${errors}`);
  }

  return result.data;
}
