# Contributing to Rudiger's Evocation of Events

Welcome, adventurer! We're excited you want to contribute to our D&D blog. This guide will help you get started, whether you're a seasoned developer or a first-time contributor.

## Ways to Contribute

### For Writers (No Coding Required!)

The easiest way to contribute is by writing blog posts. You don't need to know how to code!

#### Option 1: Submit via GitHub Issue

1. Go to [Issues](https://github.com/lexicone42/dndblog/issues/new)
2. Select the "New Blog Post" template
3. Fill in your post content
4. We'll format and publish it for you!

#### Option 2: Edit Directly on GitHub

1. Navigate to `packages/site/src/content/blog/`
2. Click "Add file" → "Create new file"
3. Name your file: `my-awesome-post.md`
4. Add your content using the template below:

```markdown
---
title: "Your Post Title"
description: "A brief summary of your post (1-2 sentences)"
pubDate: 2024-01-15
tags: ["session-recap", "character"]
author: "Your Name"
---

Your content goes here! Write in plain text or use Markdown formatting.

## Subheading

More content...
```

5. Click "Commit new file" → "Create a new branch" → "Propose new file"
6. Submit the pull request!

### For Developers

#### Quick Start

```bash
# Clone the repository
git clone https://github.com/lexicone42/dndblog.git
cd dndblog

# Install dependencies (requires pnpm)
pnpm install

# Start the development server
pnpm dev
```

Visit `http://localhost:4321` to see the blog.

#### Project Structure

```
packages/
├── site/              # Astro frontend
│   └── src/
│       ├── content/blog/  # Blog posts (Markdown)
│       ├── pages/         # Page templates
│       └── components/    # Reusable components
├── infra/             # AWS CDK infrastructure
└── content-pipeline/  # Content processing tools
```

#### Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run tests: `pnpm test`
4. Run checks: `pnpm typecheck && pnpm build`
5. Commit with a descriptive message
6. Push and open a pull request

#### Running Tests

```bash
# All tests
pnpm test

# Watch mode for TDD
pnpm test:watch

# Package-specific
pnpm --filter site test              # Component tests
pnpm --filter content-pipeline test  # Pipeline tests
pnpm --filter infra test             # Infrastructure tests

# E2E tests (requires built site)
pnpm test:e2e
pnpm test:smoke
```

#### Pre-commit Hooks

The project uses [Husky](https://typicode.github.io/husky/) with [lint-staged](https://github.com/okonet/lint-staged) to run checks before commits.

**What runs on commit:**
- Forbidden files check (prevents committing `.env`, credentials, secrets)
- TypeScript type checking on staged files
- Prettier formatting

**To bypass hooks (use sparingly):**
```bash
git commit --no-verify -m "Emergency fix"
```

**To re-enable hooks after clone:**
```bash
pnpm prepare
```

## Writing Guidelines

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Post title (keep it concise) |
| `description` | Yes | 1-2 sentence summary |
| `pubDate` | Yes | Publication date (YYYY-MM-DD) |
| `tags` | No | Array of tags for categorization |
| `author` | No | Your name |
| `heroImage` | No | Path to hero image |
| `draft` | No | Set `true` to hide from production |

### Suggested Tags

- `session-recap` - Campaign session summaries
- `character` - Character spotlights or backstories
- `worldbuilding` - Lore and setting details
- `dm-tips` - Advice for Dungeon Masters
- `homebrew` - Custom rules or content
- `announcement` - Meta/blog announcements

### Markdown Tips

```markdown
**Bold text** and *italic text*

> Blockquotes for important dialogue or quotes

- Bullet lists
- Like this

1. Numbered lists
2. Like this

`inline code` or code blocks:

\`\`\`
Multi-line code
\`\`\`
```

## Code of Conduct

- Be kind and respectful
- Keep content appropriate for all ages
- No spoilers without warnings!
- Credit sources and collaborators

## Questions?

- Open an [issue](https://github.com/lexicone42/dndblog/issues)
- Check existing issues for answers

Thank you for contributing to our adventuring chronicle!
