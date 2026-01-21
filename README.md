> ⚠️ **This repository has been archived.**
>
> This project has been migrated to the **dnd-platform** monorepo:
> - **New repository:** [lexicone42/dnd-platform](https://github.com/lexicone42/dnd-platform)
> - **Chronicles app:** `apps/chronicles/` in the monorepo
> - **Live site:** [chronicles.mawframe.ninja](https://chronicles.mawframe.ninja)
>
> All future development happens in the monorepo.

---

# Rudiger's Evocation of Events

[![CI](https://github.com/lexicone42/dndblog/actions/workflows/ci.yml/badge.svg)](https://github.com/lexicone42/dndblog/actions/workflows/ci.yml)
[![Deploy](https://github.com/lexicone42/dndblog/actions/workflows/deploy.yml/badge.svg)](https://github.com/lexicone42/dndblog/actions/workflows/deploy.yml)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-6B5CE7?logo=anthropic)](https://claude.ai/code)

**A template for creating beautiful static sites to preserve your TTRPG campaign's lore.** Built with [Claude Code](https://claude.ai/code), Astro, and AWS.

> *"Eleven sessions of adventure across Eberron—from Phandalin to Sharn to the wilds of Xen'Drik. Battles fought, friends lost, and a story worth remembering."*

## What This Is

This repository serves two purposes:

1. **A living example** - The complete chronicle of our D&D 5e campaign set in Eberron, featuring 11 sessions of adventure from Sharn's towers to the jungles of Xen'Drik
2. **A template you can fork** - Use Claude Code to help you build your own campaign site with the same structure

### What It Tracks

| Content Type | Description |
|--------------|-------------|
| **Sessions** | Narrative recaps with automatic entity linking |
| **Characters** | Player characters and NPCs with full stat blocks |
| **Enemies** | Monsters and antagonists encountered |
| **Locations** | Cities, dungeons, taverns, and landmarks |
| **Factions** | Organizations and their relationships |
| **Items** | Magic items, artifacts, and loot |
| **Spells** | Custom or notable spells |

### Features

- Full-text search across all content (via Pagefind)
- Automatic entity linking in session narratives
- Interactive D&D 5e character sheets
- PWA support for offline reading
- Dark theme optimized for late-night session prep
- RSS feed for session updates
- Citation tools for the academically inclined

## See It Live

**[chronicles.mawframe.ninja](https://chronicles.mawframe.ninja)**

Browse sessions, explore the party, and dive into the world of Eberron as experienced by our group.

## Use This Template

### Quick Start with Claude Code

```bash
# Fork and clone the repo
gh repo fork lexicone42/dndblog --clone
cd dndblog

# Install dependencies
pnpm install

# Start the dev server
pnpm dev
```

Then open Claude Code and ask:

> "Help me customize this campaign site for my own game. My campaign is set in [your setting] and features [your party]."

Claude Code can help you:
- Update the site branding and theme
- Create new character sheets from your party
- Add session recaps with automatic entity linking
- Define locations, factions, and items
- Deploy to your own domain

### Content Structure

Campaign content lives in `packages/site/src/content/campaign/`:

```
campaign/
├── characters/     # Player characters and NPCs
├── enemies/        # Monsters and antagonists
├── locations/      # Places in your world
├── factions/       # Organizations and groups
├── items/          # Magic items and loot
└── spells/         # Custom or notable spells
```

Each entity is a YAML file with frontmatter defining its properties. Session posts in `content/blog/` automatically link to entities mentioned in the text.

### Content Pipeline Tools

```bash
# Validate all entity cross-references
pnpm --filter content-pipeline validate

# Extract unlinked entity mentions from session posts
pnpm --filter content-pipeline extract

# Process content from external sources
pnpm --filter content-pipeline ingest ./my-content
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Static Site | [Astro](https://astro.build) with content collections |
| Styling | CSS with dark theme variables |
| Infrastructure | AWS CDK (S3 + CloudFront + Route53) |
| CI/CD | GitHub Actions with OIDC (no stored credentials) |
| Search | Pagefind for client-side full-text search |

### Deploy Your Own

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed AWS deployment instructions.

```bash
# Deploy to AWS (requires credentials)
./scripts/deploy.sh --domain your-chronicles.example.com --zone example.com
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - How the site is built and deployed
- [Deployment](docs/DEPLOYMENT.md) - AWS setup and CI/CD guide
- [Character Sheet](docs/CHARACTER-SHEET.md) - Character sheet component system

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.

---

*Built by a party of adventurers who wanted to remember their story. May your campaigns be as memorable.*
