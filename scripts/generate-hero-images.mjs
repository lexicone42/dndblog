#!/usr/bin/env node

/**
 * Generate hero images for blog posts using Google's Imagen 3
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=your-key node scripts/generate-hero-images.mjs
 *   GOOGLE_AI_API_KEY=your-key node scripts/generate-hero-images.mjs session-01
 *
 * Requirements:
 *   npm install @google/generative-ai
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(__dirname, '../packages/site/src/content/blog');
const ASSETS_DIR = path.join(__dirname, '../packages/site/public/assets/heroes');

// Colors for output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

async function main() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: GOOGLE_AI_API_KEY environment variable is required${colors.reset}`);
    console.log('\nUsage: GOOGLE_AI_API_KEY=your-key node scripts/generate-hero-images.mjs [post-slug]');
    process.exit(1);
  }

  // Ensure assets directory exists
  await fs.mkdir(ASSETS_DIR, { recursive: true });

  // Get target post(s)
  const targetSlug = process.argv[2];
  const files = await fs.readdir(BLOG_DIR);
  const sessionFiles = files.filter(f => f.startsWith('session-') && f.endsWith('.md'));

  const filesToProcess = targetSlug
    ? sessionFiles.filter(f => f.includes(targetSlug))
    : sessionFiles;

  if (filesToProcess.length === 0) {
    console.error(`${colors.red}No matching files found${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}Found ${filesToProcess.length} post(s) to process${colors.reset}\n`);

  for (const file of filesToProcess) {
    const slug = file.replace('.md', '');
    const imagePath = path.join(ASSETS_DIR, `${slug}.png`);

    // Check if image already exists
    try {
      await fs.access(imagePath);
      console.log(`${colors.yellow}⏭ Skipping ${slug} (image exists)${colors.reset}`);
      continue;
    } catch {
      // Image doesn't exist, generate it
    }

    console.log(`${colors.blue}Processing: ${slug}${colors.reset}`);

    try {
      // Read the blog post
      const content = await fs.readFile(path.join(BLOG_DIR, file), 'utf-8');

      // Extract frontmatter and body
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.log(`${colors.yellow}  ⚠ Could not parse frontmatter, skipping${colors.reset}`);
        continue;
      }

      const [, frontmatter, body] = frontmatterMatch;
      const title = frontmatter.match(/title:\s*"([^"]+)"/)?.[1] || slug;
      const description = frontmatter.match(/description:\s*"([^"]+)"/)?.[1] || '';

      // Step 1: Use Gemini to create an image prompt
      console.log(`  ${colors.yellow}→ Generating image prompt...${colors.reset}`);
      const imagePrompt = await generateImagePrompt(apiKey, title, description, body);
      console.log(`  ${colors.green}✓ Prompt: "${imagePrompt.substring(0, 80)}..."${colors.reset}`);

      // Step 2: Generate image with Imagen 3
      console.log(`  ${colors.yellow}→ Generating image with Imagen 3...${colors.reset}`);
      const imageData = await generateImage(apiKey, imagePrompt);

      if (imageData) {
        // Save the image
        await fs.writeFile(imagePath, imageData);
        console.log(`  ${colors.green}✓ Saved: ${imagePath}${colors.reset}`);

        // Update the blog post frontmatter
        const newHeroImage = `/assets/heroes/${slug}.png`;
        const updatedFrontmatter = frontmatter.replace(
          /heroImage:\s*"[^"]*"/,
          `heroImage: "${newHeroImage}"`
        );
        const updatedContent = `---\n${updatedFrontmatter}\n---\n${body}`;
        await fs.writeFile(path.join(BLOG_DIR, file), updatedContent);
        console.log(`  ${colors.green}✓ Updated frontmatter${colors.reset}`);
      }

    } catch (error) {
      console.error(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
      if (error.message.includes('quota') || error.message.includes('rate')) {
        console.log(`${colors.yellow}Rate limited, stopping...${colors.reset}`);
        break;
      }
    }

    console.log('');
  }

  console.log(`${colors.green}Done!${colors.reset}`);
}

/**
 * Use Gemini to generate an optimal image prompt from blog content
 */
async function generateImagePrompt(apiKey, title, description, body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are an expert at creating prompts for fantasy art image generation.

Given this D&D session recap, create a single compelling image prompt that captures the most visually dramatic moment or theme. The prompt should be for a wide landscape/banner image (16:9 aspect ratio).

Title: ${title}
Description: ${description}

Content:
${body.substring(0, 2000)}

Requirements for the prompt:
- Style: Epic fantasy digital painting, dramatic lighting, rich colors
- Focus on a single clear scene or moment
- Include specific visual details (lighting, atmosphere, key elements)
- Avoid text, words, or letters in the image
- Keep it under 200 words

Respond with ONLY the image prompt, nothing else.`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

/**
 * Generate image using Imagen 3 via Gemini API
 */
async function generateImage(apiKey, prompt) {
  // Use the Imagen 3 model for image generation
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
          safetyFilterLevel: 'block_few',
          personGeneration: 'allow_adult'
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // Try alternative endpoint if Imagen isn't available
    if (response.status === 404 || errorText.includes('not found')) {
      console.log(`  ${colors.yellow}→ Imagen 3 not available, trying Gemini image generation...${colors.reset}`);
      return await generateImageWithGemini(apiKey, prompt);
    }

    throw new Error(`Imagen API error: ${errorText}`);
  }

  const data = await response.json();

  if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
    return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
  }

  throw new Error('No image data in response');
}

/**
 * Fallback: Generate image using Gemini's native image generation
 */
async function generateImageWithGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Generate an image: ${prompt}`
          }]
        }],
        generationConfig: {
          responseModalities: ['image', 'text'],
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini image generation error: ${error}`);
  }

  const data = await response.json();

  // Look for image data in the response
  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }

  throw new Error('No image generated - model may not support image generation');
}

main().catch(console.error);
