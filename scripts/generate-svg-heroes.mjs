#!/usr/bin/env node

/**
 * Generate SVG hero images for blog posts
 * No external APIs needed - pure vector art generation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(__dirname, '../packages/site/src/content/blog');
const ASSETS_DIR = path.join(__dirname, '../packages/site/public/assets/heroes');

// Color palettes for different themes
const palettes = {
  dungeon: ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ffd369'],
  forest: ['#1a3c34', '#2d5a4a', '#4a7c6f', '#8eb69b', '#d4e7c5'],
  city: ['#2c3e50', '#34495e', '#5d6d7e', '#aeb6bf', '#f4d03f'],
  magic: ['#1a1a40', '#3d2c8d', '#8062d6', '#c69ff3', '#f8f0fb'],
  battle: ['#2c1810', '#5c3317', '#8b4513', '#cd853f', '#dc143c'],
  dragon: ['#1a0a0a', '#3d1c1c', '#722f37', '#c9a227', '#ff6b35'],
  temple: ['#1c1c1c', '#2d2d44', '#4a4a6a', '#9e8576', '#d4af37'],
  tavern: ['#2d1b0e', '#5c3d2e', '#8b6914', '#d4a03c', '#fff8dc'],
};

// Scene templates based on keywords
const sceneTemplates = {
  bell: { palette: 'magic', elements: ['bell', 'rays', 'mist'] },
  door: { palette: 'dungeon', elements: ['archway', 'shadows', 'runes'] },
  forest: { palette: 'forest', elements: ['trees', 'mist', 'moonlight'] },
  dryad: { palette: 'forest', elements: ['tree', 'spirit', 'leaves'] },
  vault: { palette: 'temple', elements: ['pillars', 'treasure', 'shadows'] },
  maw: { palette: 'magic', elements: ['portal', 'energy', 'void'] },
  dragon: { palette: 'dragon', elements: ['dragon', 'flames', 'cave'] },
  city: { palette: 'city', elements: ['towers', 'bridges', 'skyline'] },
  stone: { palette: 'dungeon', elements: ['ruins', 'crystal', 'darkness'] },
  default: { palette: 'battle', elements: ['swords', 'shield', 'banner'] },
};

function generateSVG(title, tags, sessionNum) {
  // Determine theme from title/tags
  const titleLower = title.toLowerCase();
  let theme = 'default';
  for (const key of Object.keys(sceneTemplates)) {
    if (titleLower.includes(key) || tags.some(t => t.includes(key))) {
      theme = key;
      break;
    }
  }

  const { palette: paletteName, elements } = sceneTemplates[theme];
  const colors = palettes[paletteName];

  // Generate unique but deterministic variations based on session number
  const seed = sessionNum * 137;
  const rand = (i) => ((seed + i * 73) % 100) / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" preserveAspectRatio="xMidYMid slice">
  <defs>
    <!-- Gradients -->
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[0]}"/>
      <stop offset="50%" style="stop-color:${colors[1]}"/>
      <stop offset="100%" style="stop-color:${colors[2]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="60%" r="50%">
      <stop offset="0%" style="stop-color:${colors[4]};stop-opacity:0.4"/>
      <stop offset="100%" style="stop-color:${colors[4]};stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="ground" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[1]}"/>
      <stop offset="100%" style="stop-color:${colors[0]}"/>
    </linearGradient>
    <!-- Filters -->
    <filter id="blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3"/>
    </filter>
    <filter id="glow-filter">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="675" fill="url(#sky)"/>

  <!-- Atmospheric glow -->
  <ellipse cx="${600 + rand(1) * 200 - 100}" cy="${400 + rand(2) * 100}" rx="500" ry="300" fill="url(#glow)"/>

  <!-- Stars/particles -->
  ${generateStars(colors[4], seed)}

  <!-- Distant mountains/shapes -->
  ${generateMountains(colors, seed)}

  <!-- Main focal element based on theme -->
  ${generateFocalElement(theme, colors, seed)}

  <!-- Foreground silhouettes -->
  ${generateForeground(colors[0], seed)}

  <!-- Atmospheric overlay -->
  <rect width="1200" height="675" fill="${colors[0]}" opacity="0.1"/>

  <!-- Vignette -->
  <rect width="1200" height="675" fill="url(#vignette)" opacity="0.5">
    <defs>
      <radialGradient id="vignette">
        <stop offset="50%" style="stop-color:transparent"/>
        <stop offset="100%" style="stop-color:${colors[0]}"/>
      </radialGradient>
    </defs>
  </rect>

  <!-- Session number badge -->
  <g transform="translate(60, 600)">
    <rect x="0" y="0" width="80" height="50" rx="8" fill="${colors[0]}" opacity="0.8"/>
    <text x="40" y="35" font-family="Georgia, serif" font-size="28" font-weight="bold" fill="${colors[4]}" text-anchor="middle">${sessionNum}</text>
  </g>
</svg>`;
}

function generateStars(color, seed) {
  let stars = '';
  for (let i = 0; i < 50; i++) {
    const x = ((seed + i * 127) % 1200);
    const y = ((seed + i * 89) % 400);
    const r = 0.5 + ((seed + i * 31) % 20) / 20;
    const opacity = 0.3 + ((seed + i * 17) % 50) / 100;
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
  }
  return stars;
}

function generateMountains(colors, seed) {
  const peaks = [];
  // Back layer
  let points = '0,500 ';
  for (let x = 0; x <= 1200; x += 100) {
    const y = 350 + ((seed + x * 7) % 150);
    points += `${x},${y} `;
  }
  points += '1200,500';
  peaks.push(`<polygon points="${points}" fill="${colors[1]}" opacity="0.5"/>`);

  // Front layer
  points = '0,550 ';
  for (let x = 0; x <= 1200; x += 80) {
    const y = 400 + ((seed + x * 13) % 150);
    points += `${x},${y} `;
  }
  points += '1200,550';
  peaks.push(`<polygon points="${points}" fill="${colors[2]}" opacity="0.6"/>`);

  return peaks.join('\n  ');
}

function generateFocalElement(theme, colors, seed) {
  switch (theme) {
    case 'bell':
      return `
    <g transform="translate(600, 300)" filter="url(#glow-filter)">
      <ellipse cx="0" cy="0" rx="80" ry="100" fill="none" stroke="${colors[4]}" stroke-width="8"/>
      <ellipse cx="0" cy="0" rx="60" ry="80" fill="none" stroke="${colors[3]}" stroke-width="4"/>
      <circle cx="0" cy="60" r="15" fill="${colors[4]}"/>
      ${[...Array(8)].map((_, i) => `<line x1="0" y1="0" x2="${Math.cos(i * Math.PI / 4) * 150}" y2="${Math.sin(i * Math.PI / 4) * 150}" stroke="${colors[4]}" stroke-width="2" opacity="0.5"/>`).join('')}
    </g>`;

    case 'door':
      return `
    <g transform="translate(600, 350)">
      <rect x="-80" y="-200" width="160" height="250" fill="${colors[0]}" stroke="${colors[3]}" stroke-width="6" rx="80" ry="80"/>
      <rect x="-60" y="-180" width="120" height="220" fill="${colors[1]}" rx="60" ry="60"/>
      <circle cx="40" cy="0" r="10" fill="${colors[4]}"/>
      ${[...Array(6)].map((_, i) => `<text x="-50" y="${-150 + i * 40}" font-family="serif" font-size="20" fill="${colors[4]}" opacity="0.6">&#x16A0;</text>`).join('')}
    </g>`;

    case 'forest':
    case 'dryad':
      return `
    <g transform="translate(600, 400)">
      ${[...Array(5)].map((_, i) => {
        const x = -200 + i * 100;
        const h = 200 + ((seed + i * 50) % 100);
        return `<path d="M${x},50 Q${x-30},-${h/2} ${x},-${h} Q${x+30},-${h/2} ${x},50" fill="${colors[2]}" opacity="${0.6 + i * 0.08}"/>`;
      }).join('')}
      <circle cx="0" cy="-100" r="60" fill="${colors[4]}" opacity="0.3" filter="url(#blur)"/>
    </g>`;

    case 'dragon':
      return `
    <g transform="translate(600, 300)">
      <path d="M-150,100 Q-100,-50 0,-80 Q100,-50 150,100 L100,50 Q50,-20 0,-30 Q-50,-20 -100,50 Z" fill="${colors[3]}" opacity="0.9"/>
      <circle cx="-40" cy="-20" r="8" fill="${colors[4]}"/>
      <circle cx="40" cy="-20" r="8" fill="${colors[4]}"/>
      <path d="M-80,-60 Q-120,-100 -100,-140 M80,-60 Q120,-100 100,-140" stroke="${colors[3]}" stroke-width="8" fill="none"/>
      ${[...Array(3)].map((_, i) => `<ellipse cx="${-20 + i * 20}" cy="120" rx="30" ry="15" fill="${colors[4]}" opacity="${0.3 - i * 0.1}"/>`).join('')}
    </g>`;

    case 'city':
      return `
    <g transform="translate(600, 450)">
      ${[...Array(12)].map((_, i) => {
        const x = -400 + i * 70 + ((seed + i * 30) % 40);
        const h = 100 + ((seed + i * 47) % 200);
        const w = 30 + ((seed + i * 23) % 30);
        return `<rect x="${x}" y="${-h}" width="${w}" height="${h}" fill="${colors[2]}" opacity="${0.6 + ((seed + i) % 30) / 100}"/>
                <rect x="${x + 5}" y="${-h + 10}" width="8" height="8" fill="${colors[4]}" opacity="0.8"/>`;
      }).join('')}
    </g>`;

    case 'vault':
    case 'temple':
      return `
    <g transform="translate(600, 380)">
      <rect x="-200" y="-250" width="400" height="300" fill="${colors[1]}" opacity="0.3"/>
      ${[-150, -50, 50, 150].map(x => `<rect x="${x - 15}" y="-250" width="30" height="280" fill="${colors[2]}"/>`).join('')}
      <polygon points="-220,-250 0,-350 220,-250" fill="${colors[2]}"/>
      <circle cx="0" cy="-150" r="40" fill="${colors[4]}" opacity="0.6" filter="url(#blur)"/>
    </g>`;

    case 'magic':
    case 'maw':
      return `
    <g transform="translate(600, 340)">
      <ellipse cx="0" cy="0" rx="120" ry="120" fill="${colors[1]}" filter="url(#blur)"/>
      <ellipse cx="0" cy="0" rx="100" ry="100" fill="${colors[0]}"/>
      <ellipse cx="0" cy="0" rx="80" ry="80" fill="none" stroke="${colors[4]}" stroke-width="3" stroke-dasharray="10,5">
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/>
      </ellipse>
      ${[...Array(8)].map((_, i) => `<line x1="0" y1="0" x2="${Math.cos(i * Math.PI / 4) * 150}" y2="${Math.sin(i * Math.PI / 4) * 150}" stroke="${colors[3]}" stroke-width="2" opacity="0.4"/>`).join('')}
    </g>`;

    case 'stone':
      return `
    <g transform="translate(600, 380)">
      <polygon points="-100,50 -80,-100 0,-150 80,-100 100,50" fill="${colors[2]}" opacity="0.9"/>
      <polygon points="-60,30 -50,-60 0,-90 50,-60 60,30" fill="${colors[3]}"/>
      <ellipse cx="0" cy="-50" rx="20" ry="30" fill="${colors[4]}" opacity="0.8" filter="url(#blur)"/>
    </g>`;

    default:
      return `
    <g transform="translate(600, 350)">
      <path d="M-60,50 L-60,-100 L0,-150 L60,-100 L60,50 Z" fill="${colors[2]}" stroke="${colors[3]}" stroke-width="4"/>
      <line x1="-100" y1="0" x2="-20" y2="0" stroke="${colors[4]}" stroke-width="8"/>
      <line x1="100" y1="0" x2="20" y2="0" stroke="${colors[4]}" stroke-width="8"/>
    </g>`;
  }
}

function generateForeground(darkColor, seed) {
  // Grass/ground silhouettes
  let grass = '';
  for (let x = 0; x < 1200; x += 15) {
    const h = 20 + ((seed + x * 11) % 40);
    const lean = ((seed + x * 7) % 20) - 10;
    grass += `<path d="M${x},675 Q${x + lean},${675 - h} ${x + 5},675" stroke="${darkColor}" stroke-width="3" fill="none"/>`;
  }
  return `<g opacity="0.7">${grass}</g>`;
}

async function main() {
  await fs.mkdir(ASSETS_DIR, { recursive: true });

  const files = await fs.readdir(BLOG_DIR);
  const sessionFiles = files.filter(f => f.startsWith('session-') && f.endsWith('.md'));

  console.log(`\x1b[34mGenerating SVG hero images for ${sessionFiles.length} sessions...\x1b[0m\n`);

  for (const file of sessionFiles) {
    const slug = file.replace('.md', '');
    const sessionNum = parseInt(slug.match(/session-(\d+)/)?.[1] || '0');

    // Read frontmatter
    const content = await fs.readFile(path.join(BLOG_DIR, file), 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = frontmatterMatch?.[1] || '';

    const title = frontmatter.match(/title:\s*"([^"]+)"/)?.[1] || slug;
    const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]+)\]/);
    const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().replace(/"/g, '')) : [];

    // Generate SVG
    const svg = generateSVG(title, tags, sessionNum);
    const svgPath = path.join(ASSETS_DIR, `${slug}.svg`);
    await fs.writeFile(svgPath, svg);

    // Update frontmatter
    const newHeroImage = `/assets/heroes/${slug}.svg`;
    if (frontmatter.includes('heroImage:')) {
      const updatedContent = content.replace(
        /heroImage:\s*"[^"]*"/,
        `heroImage: "${newHeroImage}"`
      );
      await fs.writeFile(path.join(BLOG_DIR, file), updatedContent);
    }

    console.log(`\x1b[32m✓\x1b[0m ${slug}: ${title}`);
  }

  console.log(`\n\x1b[32mDone! Generated ${sessionFiles.length} hero images.\x1b[0m`);
  console.log(`\x1b[33mRun 'npm run build' to see them on your site.\x1b[0m`);
}

main().catch(console.error);
