#!/usr/bin/env node

import { Command } from 'commander';
import { ingest, checkDuplicateSlugs } from './ingest.js';
import { processContent, clearOutputDirectory } from './process.js';
import { processScreenshots } from './screenshots.js';
import { publish } from './publish.js';

const program = new Command();

program
  .name('content')
  .description('Content pipeline CLI for the Rudiger's Evocation of Events')
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

program.parse();
