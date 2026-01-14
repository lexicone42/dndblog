import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, it, expect, beforeEach } from 'vitest';
import BreadcrumbNav from './BreadcrumbNav.astro';
import StatusBadge from './StatusBadge.astro';
import MetaTag from './MetaTag.astro';
import TagsList from './TagsList.astro';
import EntityCard from './EntityCard.astro';
import RelationshipList from './RelationshipList.astro';
import PostCard from './PostCard.astro';

/**
 * Normalize HTML output for snapshot testing.
 * Removes Astro debug attributes that contain environment-specific paths.
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/\s*data-astro-source-file="[^"]*"/g, '')
    .replace(/\s*data-astro-source-loc="[^"]*"/g, '')
    .replace(/\s*data-astro-cid-[a-z0-9]+/g, '');
}

describe('BreadcrumbNav', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders breadcrumb with multiple items', async () => {
    const result = await container.renderToString(BreadcrumbNav, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Campaign', href: '/campaign' },
          { label: 'Characters' },
        ],
      },
    });

    // Check links are rendered
    expect(result).toContain('href="/"');
    expect(result).toContain('Home');
    expect(result).toContain('href="/campaign"');
    expect(result).toContain('Campaign');

    // Current page should not have href
    expect(result).toContain('aria-current="page"');
    expect(result).toContain('Characters');

    // Should have separators
    expect(result).toContain('/</span>');

    expect(normalizeHtml(result)).toMatchSnapshot();
  });

  it('renders single item breadcrumb', async () => {
    const result = await container.renderToString(BreadcrumbNav, {
      props: {
        items: [{ label: 'Home' }],
      },
    });

    expect(result).toContain('Home');
    expect(result).toContain('aria-current="page"');
    // Should not have separator
    expect(result).not.toContain('breadcrumb__sep');
  });

  it('handles accessibility attributes correctly', async () => {
    const result = await container.renderToString(BreadcrumbNav, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Current' },
        ],
      },
    });

    expect(result).toContain('aria-label="Breadcrumb"');
    expect(result).toContain('aria-hidden="true"');
  });
});

describe('StatusBadge', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders active status', async () => {
    const result = await container.renderToString(StatusBadge, {
      props: { status: 'active' },
    });

    expect(result).toContain('active');
    expect(result).toContain('status-badge--active');
  });

  it('renders dead status', async () => {
    const result = await container.renderToString(StatusBadge, {
      props: { status: 'dead' },
    });

    expect(result).toContain('dead');
    expect(result).toContain('status-badge--dead');
  });

  it('renders unknown status as fallback', async () => {
    const result = await container.renderToString(StatusBadge, {
      props: { status: 'custom-status' },
    });

    expect(result).toContain('custom-status');
    expect(result).toContain('status-badge--unknown');
  });

  it('renders different sizes', async () => {
    const smResult = await container.renderToString(StatusBadge, {
      props: { status: 'active', size: 'sm' },
    });
    const lgResult = await container.renderToString(StatusBadge, {
      props: { status: 'active', size: 'lg' },
    });

    expect(smResult).toContain('status-badge--sm');
    expect(lgResult).toContain('status-badge--lg');
  });

  it('handles all supported statuses', async () => {
    const statuses = ['active', 'inactive', 'dead', 'destroyed', 'unknown', 'missing', 'transformed', 'dormant'];

    for (const status of statuses) {
      const result = await container.renderToString(StatusBadge, {
        props: { status },
      });
      expect(result).toContain(status);
    }
  });
});

describe('MetaTag', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders default variant', async () => {
    const result = await container.renderToString(MetaTag, {
      props: { label: 'Wizard' },
    });

    expect(result).toContain('Wizard');
    expect(result).toContain('meta-tag--default');
  });

  it('renders PC variant', async () => {
    const result = await container.renderToString(MetaTag, {
      props: { label: 'Player', variant: 'pc' },
    });

    expect(result).toContain('Player');
    expect(result).toContain('meta-tag--pc');
  });

  it('renders NPC variant', async () => {
    const result = await container.renderToString(MetaTag, {
      props: { label: 'Ally', variant: 'npc' },
    });

    expect(result).toContain('Ally');
    expect(result).toContain('meta-tag--npc');
  });

  it('renders enemy and boss variants', async () => {
    const enemyResult = await container.renderToString(MetaTag, {
      props: { label: 'Goblin', variant: 'enemy' },
    });
    const bossResult = await container.renderToString(MetaTag, {
      props: { label: 'Dragon', variant: 'boss' },
    });

    expect(enemyResult).toContain('meta-tag--enemy');
    expect(bossResult).toContain('meta-tag--boss');
  });
});

describe('TagsList', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders tags without links', async () => {
    const result = await container.renderToString(TagsList, {
      props: { tags: ['combat', 'exploration', 'roleplay'] },
    });

    expect(result).toContain('combat');
    expect(result).toContain('exploration');
    expect(result).toContain('roleplay');
    expect(result).toContain('tag-text');
    expect(result).not.toContain('href=');
  });

  it('renders tags with links when linkPrefix provided', async () => {
    const result = await container.renderToString(TagsList, {
      props: {
        tags: ['combat', 'roleplay'],
        linkPrefix: '/blog/tag/',
      },
    });

    expect(result).toContain('href="/blog/tag/combat"');
    expect(result).toContain('href="/blog/tag/roleplay"');
    expect(result).toContain('tag-link');
  });

  it('renders nothing when tags array is empty', async () => {
    const result = await container.renderToString(TagsList, {
      props: { tags: [] },
    });

    expect(result.trim()).toBe('');
  });

  it('renders different sizes', async () => {
    const smResult = await container.renderToString(TagsList, {
      props: { tags: ['test'], size: 'sm' },
    });
    const mdResult = await container.renderToString(TagsList, {
      props: { tags: ['test'], size: 'md' },
    });

    expect(smResult).toContain('tags-list--sm');
    expect(mdResult).toContain('tags-list--md');
  });
});

describe('EntityCard', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders basic entity card', async () => {
    const result = await container.renderToString(EntityCard, {
      props: {
        name: 'Gandalf',
        href: '/campaign/characters/gandalf',
        description: 'A wise wizard',
      },
    });

    expect(result).toContain('Gandalf');
    expect(result).toContain('href="/campaign/characters/gandalf"');
    expect(result).toContain('A wise wizard');
    expect(normalizeHtml(result)).toMatchSnapshot();
  });

  it('renders status badge for non-active entities', async () => {
    const result = await container.renderToString(EntityCard, {
      props: {
        name: 'Boromir',
        href: '/campaign/characters/boromir',
        status: 'dead',
      },
    });

    expect(result).toContain('dead');
    expect(result).toContain('status-badge');
  });

  it('does not render status badge for active entities', async () => {
    const result = await container.renderToString(EntityCard, {
      props: {
        name: 'Aragorn',
        href: '/campaign/characters/aragorn',
        status: 'active',
      },
    });

    expect(result).not.toContain('status-badge');
  });

  it('renders subtype badge with correct variant for PC', async () => {
    const result = await container.renderToString(EntityCard, {
      props: {
        name: 'Frodo',
        href: '/campaign/characters/frodo',
        subtype: 'pc',
        entityType: 'character',
      },
    });

    expect(result).toContain('pc');
    expect(result).toContain('meta-tag--pc');
  });

  it('renders subtype badge with correct variant for enemy', async () => {
    const result = await container.renderToString(EntityCard, {
      props: {
        name: 'Sauron',
        href: '/campaign/enemies/sauron',
        subtype: 'boss',
        entityType: 'enemy',
      },
    });

    expect(result).toContain('boss');
    expect(result).toContain('meta-tag--boss');
  });

  it('renders meta tags', async () => {
    const result = await container.renderToString(EntityCard, {
      props: {
        name: 'Legolas',
        href: '/campaign/characters/legolas',
        metaTags: ['Elf', 'Ranger'],
      },
    });

    expect(result).toContain('Elf');
    expect(result).toContain('Ranger');
  });
});

describe('RelationshipList', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders relationships with linked entities', async () => {
    const result = await container.renderToString(RelationshipList, {
      props: {
        relationships: [
          { entity: 'gandalf', type: 'mentor', note: 'Trusted advisor' },
          { entity: 'sauron', type: 'enemy' },
        ],
        entityLookup: {
          gandalf: { name: 'Gandalf', path: '/campaign/characters/gandalf' },
        },
      },
    });

    // Linked entity should have href
    expect(result).toContain('href="/campaign/characters/gandalf"');
    expect(result).toContain('Gandalf');
    expect(result).toContain('mentor');

    // Unlinked entity should show plain text
    expect(result).toContain('sauron');
    expect(result).toContain('enemy');

    // Note should display
    expect(result).toContain('Trusted advisor');

    expect(normalizeHtml(result)).toMatchSnapshot();
  });

  it('renders custom title', async () => {
    const result = await container.renderToString(RelationshipList, {
      props: {
        relationships: [{ entity: 'test', type: 'ally' }],
        entityLookup: {},
        title: 'Known Associates',
      },
    });

    expect(result).toContain('Known Associates');
  });

  it('renders nothing when no relationships', async () => {
    const result = await container.renderToString(RelationshipList, {
      props: {
        relationships: [],
        entityLookup: {},
      },
    });

    expect(result.trim()).toBe('');
  });
});

describe('PostCard', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  it('renders basic post card', async () => {
    // Use noon UTC to avoid timezone date shifts
    const pubDate = new Date('2024-01-15T12:00:00Z');
    const result = await container.renderToString(PostCard, {
      props: {
        title: 'Session 1: The Beginning',
        description: 'Our heroes meet for the first time...',
        pubDate,
        slug: 'session-1',
      },
    });

    expect(result).toContain('Session 1: The Beginning');
    expect(result).toContain('Our heroes meet for the first time...');
    expect(result).toContain('href="/blog/session-1"');
    // Check date is formatted (locale may vary)
    expect(result).toContain('2024');
    expect(result).toContain('post-card__date');
    expect(normalizeHtml(result)).toMatchSnapshot();
  });

  it('renders hero image when provided', async () => {
    const result = await container.renderToString(PostCard, {
      props: {
        title: 'Test Post',
        description: 'Test description',
        pubDate: new Date('2024-01-15'),
        slug: 'test',
        heroImage: '/images/hero.jpg',
      },
    });

    expect(result).toContain('src="/images/hero.jpg"');
    expect(result).toContain('post-card__image');
  });

  it('renders reading time when provided', async () => {
    const result = await container.renderToString(PostCard, {
      props: {
        title: 'Test Post',
        description: 'Test description',
        pubDate: new Date('2024-01-15'),
        slug: 'test',
        readingTime: 5,
      },
    });

    expect(result).toContain('5 min read');
  });

  it('renders tags limited to 3', async () => {
    const result = await container.renderToString(PostCard, {
      props: {
        title: 'Test Post',
        description: 'Test description',
        pubDate: new Date('2024-01-15'),
        slug: 'test',
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      },
    });

    expect(result).toContain('tag1');
    expect(result).toContain('tag2');
    expect(result).toContain('tag3');
    expect(result).not.toContain('tag4');
    expect(result).not.toContain('tag5');
  });

  it('sets priority loading attributes', async () => {
    const result = await container.renderToString(PostCard, {
      props: {
        title: 'Test Post',
        description: 'Test description',
        pubDate: new Date('2024-01-15'),
        slug: 'test',
        heroImage: '/images/hero.jpg',
        priority: true,
      },
    });

    expect(result).toContain('loading="eager"');
    expect(result).toContain('fetchpriority="high"');
  });

  it('sets lazy loading by default', async () => {
    const result = await container.renderToString(PostCard, {
      props: {
        title: 'Test Post',
        description: 'Test description',
        pubDate: new Date('2024-01-15'),
        slug: 'test',
        heroImage: '/images/hero.jpg',
      },
    });

    expect(result).toContain('loading="lazy"');
  });
});
