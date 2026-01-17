#!/usr/bin/env node

import { Command } from 'commander';
import { ingest, checkDuplicateSlugs } from './ingest.js';
import { processContent, clearOutputDirectory } from './process.js';
import { processScreenshots } from './screenshots.js';
import { publish } from './publish.js';
import { validateWorld, printValidationResult } from './validate-world.js';
import { extractEntities, printExtractionResult, createMissingEntities } from './extract-entities.js';

const program = new Command();

program
  .name('content')
  .description("Content pipeline CLI for Rudiger's Evocation of Events")
  .version('1.0.0');

/**
 * Ingest command: Read and validate markdown files from a source directory.
 */
program
  .command('ingest <sourceDir>')
  .description('Ingest markdown files from a source directory')
  .option('-c, --check-duplicates', 'Check for duplicate slugs')
  .action(async (sourceDir: string, options: { checkDuplicates?: boolean }) => {
    try {
      const result = await ingest(sourceDir);

      if (options.checkDuplicates && result.posts.length > 0) {
        console.log('\nChecking for duplicates...');
        const duplicates = checkDuplicateSlugs(result.posts);

        if (duplicates.length > 0) {
          console.error('\nDuplicate slugs found:');
          for (const dup of duplicates) {
            console.error(dup);
          }
          process.exit(1);
        } else {
          console.log('  ✓ No duplicate slugs found');
        }
      }

      if (result.errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Process command: Copy ingested posts to the site content directory.
 */
program
  .command('process <sourceDir>')
  .description('Process and copy markdown files to the site content directory')
  .option('-o, --output <dir>', 'Output directory', 'packages/site/src/content/blog')
  .option('--clear', 'Clear existing posts before processing')
  .action(async (sourceDir: string, options: { output: string; clear?: boolean }) => {
    try {
      // First ingest
      const ingestResult = await ingest(sourceDir);

      if (ingestResult.errors.length > 0) {
        console.error('\nIngestion errors found. Aborting.');
        process.exit(1);
      }

      // Check for duplicates
      const duplicates = checkDuplicateSlugs(ingestResult.posts);
      if (duplicates.length > 0) {
        console.error('\nDuplicate slugs found:');
        for (const dup of duplicates) {
          console.error(dup);
        }
        process.exit(1);
      }

      // Clear if requested
      if (options.clear) {
        console.log('\nClearing existing content...');
        clearOutputDirectory(options.output);
      }

      // Process
      console.log();
      const processResult = await processContent(ingestResult.posts, options.output);

      if (processResult.errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Screenshots command: Process images for web optimization.
 */
program
  .command('screenshots <imageDir>')
  .description('Process images for web optimization')
  .option('-o, --output <dir>', 'Output directory', 'packages/site/public/assets/images')
  .option('--originals <dir>', 'Originals backup directory', 'packages/site/public/assets/originals')
  .action(async (imageDir: string, options: { output: string; originals: string }) => {
    try {
      const result = await processScreenshots(imageDir, options.output, options.originals);

      if (result.errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Publish command: Run the full publishing pipeline.
 */
program
  .command('publish <sourceDir>')
  .description('Run the full content publishing pipeline')
  .option('-i, --images <dir>', 'Image directory to process')
  .option('-o, --output <dir>', 'Output directory for posts', 'packages/site/src/content/blog')
  .option('--clear', 'Clear existing posts before processing')
  .action(async (sourceDir: string, options: { images?: string; output: string; clear?: boolean }) => {
    try {
      const result = await publish({
        sourceDir,
        imageDir: options.images,
        outputDir: options.output,
        clearExisting: options.clear,
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Validate command: Check world consistency between blog posts and entities.
 */
program
  .command('validate')
  .description('Validate world consistency (pronouns, entity links, unlinked mentions)')
  .option('-b, --blog <dir>', 'Blog posts directory', 'packages/site/src/content/blog')
  .option('-c, --campaign <dir>', 'Campaign entities directory', 'packages/site/src/content/campaign')
  .option('--strict', 'Fail on warnings too (not just errors)')
  .action(async (options: { blog: string; campaign: string; strict?: boolean }) => {
    try {
      const result = validateWorld(options.blog, options.campaign);
      printValidationResult(result);

      if (!result.valid) {
        process.exit(1);
      }

      if (options.strict && result.issues.length > 0) {
        console.log('\n--strict mode: Failing due to warnings');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Extract command: Find missing entities mentioned in blog posts.
 */
program
  .command('extract')
  .description('Extract and create missing entities from blog posts')
  .option('-b, --blog <dir>', 'Blog posts directory', 'packages/site/src/content/blog')
  .option('-c, --campaign <dir>', 'Campaign entities directory', 'packages/site/src/content/campaign')
  .option('--create', 'Actually create stub files for missing entities')
  .option('--type <type>', 'Only extract entities of a specific type (character, location, faction, item, enemy)')
  .action(async (options: { blog: string; campaign: string; create?: boolean; type?: string }) => {
    try {
      const result = extractEntities(options.blog, options.campaign);
      printExtractionResult(result);

      if (options.create && result.missing.length > 0) {
        // Filter by type if specified
        let toCreate = result.missing;
        if (options.type) {
          toCreate = result.missing.filter((e) => e.suggestedType === options.type);
          console.log(`\nFiltered to ${toCreate.length} ${options.type} entities`);
        }

        console.log(`\nCreating ${toCreate.length} entity stubs...`);
        const created = createMissingEntities(toCreate, options.campaign, false);

        for (const item of created) {
          if (item.created) {
            console.log(`  ✓ Created: ${item.path}`);
          } else {
            console.log(`  - Skipped (exists): ${item.path}`);
          }
        }

        console.log(`\nCreated ${created.filter((c) => c.created).length} stub files.`);
        console.log('Review and edit the generated files to add proper descriptions.');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
