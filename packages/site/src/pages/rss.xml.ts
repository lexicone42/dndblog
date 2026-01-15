import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  // Get all public, non-draft posts
  const posts = await getCollection('blog', ({ data }: { data: { draft?: boolean; visibility?: string } }) => {
    return !data.draft && data.visibility === 'public';
  });

  // Type for blog entries
  type BlogEntry = typeof posts[0];

  // Sort by date (newest first)
  const sortedPosts = posts.sort(
    (a: BlogEntry, b: BlogEntry) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return rss({
    title: "Rudiger's Evocation of Events",
    description: 'Chronicles of our D&D 5e campaign - session recaps, character stories, and adventure logs.',
    site: context.site ?? 'https://chronicles.mawframe.ninja',
    items: sortedPosts.map((post: BlogEntry) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      author: post.data.author,
      categories: post.data.tags,
    })),
    customData: `<language>en-us</language>`,
  });
}
