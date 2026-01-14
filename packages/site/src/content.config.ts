import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog post frontmatter schema.
 *
 * Required fields:
 * - title: Post title
 * - description: Short description for SEO and previews
 * - pubDate: Publication date
 *
 * Optional fields for current functionality:
 * - updatedDate: Last update date
 * - heroImage: Path to hero image
 * - draft: Whether post is a draft (excluded from production)
 * - tags: Array of tags for categorization
 * - author: Author name
 *
 * Future Phase 2 fields (added now, used later):
 * - visibility: Access control level
 * - campaignId: Link to specific campaign
 * - contributors: Additional contributors
 */
const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    // Required fields
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),

    // Optional fields
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),

    // Future Phase 2 fields - include now for forward compatibility
    visibility: z.enum(['public', 'private', 'campaign']).default('public'),
    campaignId: z.string().optional(),
    contributors: z.array(z.string()).default([]),
  }),
});

export const collections = {
  blog: blogCollection,
};
