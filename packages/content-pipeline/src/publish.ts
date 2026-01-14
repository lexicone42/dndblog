import { ingest, checkDuplicateSlugs } from './ingest.js';
import { processContent, clearOutputDirectory } from './process.js';
import { processScreenshots } from './screenshots.js';

export interface PublishOptions {
  sourceDir: string;
  imageDir?: string;
  outputDir?: string;
  clearExisting?: boolean;
}

export interface PublishResult {
  success: boolean;
  postsIngested: number;
  postsProcessed: number;
  imagesProcessed: number;
  errors: string[];
}

/**
 * Runs the full content publishing pipeline:
 * 1. Ingest markdown files from source directory
 * 2. Validate frontmatter
 * 3. Check for duplicate slugs
 * 4. Process and copy posts to site content directory
 * 5. Process images (if imageDir provided)
 */
export async function publish(options: PublishOptions): Promise<PublishResult> {
  const {
    sourceDir,
    imageDir,
    outputDir,
    clearExisting = false,
  } = options;

  const result: PublishResult = {
    success: true,
    postsIngested: 0,
    postsProcessed: 0,
    imagesProcessed: 0,
    errors: [],
  };

  console.log('='.repeat(50));
  console.log('Content Publishing Pipeline');
  console.log('='.repeat(50));
  console.log();

  try {
    // Step 1: Ingest markdown files
    console.log('Step 1: Ingesting content...');
    console.log('-'.repeat(50));
    const ingestResult = await ingest(sourceDir);
    result.postsIngested = ingestResult.posts.length;

    for (const error of ingestResult.errors) {
      result.errors.push(`Ingest error in ${error.filePath}: ${error.error}`);
    }

    if (ingestResult.posts.length === 0) {
      console.log('\nNo posts to process. Exiting.');
      return result;
    }

    console.log();

    // Step 2: Check for duplicate slugs
    console.log('Step 2: Checking for duplicates...');
    console.log('-'.repeat(50));
    const duplicates = checkDuplicateSlugs(ingestResult.posts);

    if (duplicates.length > 0) {
      for (const dup of duplicates) {
        result.errors.push(dup);
        console.error(`  ✗ ${dup}`);
      }
      result.success = false;
      console.log('\nDuplicate slugs found. Please rename conflicting files.');
      return result;
    }

    console.log('  ✓ No duplicate slugs found');
    console.log();

    // Step 3: Clear existing content (if requested)
    if (clearExisting && outputDir) {
      console.log('Step 3: Clearing existing content...');
      console.log('-'.repeat(50));
      clearOutputDirectory(outputDir);
      console.log();
    }

    // Step 4: Process and copy posts
    console.log('Step 4: Processing content...');
    console.log('-'.repeat(50));
    const processResult = await processContent(ingestResult.posts, outputDir);
    result.postsProcessed = processResult.processed.length;

    for (const error of processResult.errors) {
      result.errors.push(`Process error for ${error.slug}: ${error.error}`);
    }

    console.log();

    // Step 5: Process images (if directory provided)
    if (imageDir) {
      console.log('Step 5: Processing images...');
      console.log('-'.repeat(50));
      const screenshotsResult = await processScreenshots(imageDir);
      result.imagesProcessed = screenshotsResult.processed.length;

      for (const error of screenshotsResult.errors) {
        result.errors.push(`Image error for ${error.filePath}: ${error.error}`);
      }

      console.log();
    }

    // Summary
    console.log('='.repeat(50));
    console.log('Summary');
    console.log('='.repeat(50));
    console.log(`  Posts ingested:  ${result.postsIngested}`);
    console.log(`  Posts processed: ${result.postsProcessed}`);
    console.log(`  Images processed: ${result.imagesProcessed}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      result.success = false;
      console.log('\nErrors:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    } else {
      console.log('\n✓ Publishing completed successfully!');
    }
  } catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error(`\n✗ Fatal error: ${errorMessage}`);
  }

  return result;
}
