import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

export interface ImageManifestEntry {
  originalPath: string;
  originalName: string;
  outputPath: string;
  formats: {
    webp: string;
    original: string;
  };
  sizes: {
    small: string;
    medium: string;
    large: string;
    original: string;
  };
  dimensions: {
    width: number;
    height: number;
  };
}

export interface ScreenshotsResult {
  processed: ImageManifestEntry[];
  errors: { filePath: string; error: string }[];
  manifest: ImageManifestEntry[];
}

/**
 * Supported image extensions.
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

/**
 * Responsive image sizes.
 */
const SIZES = {
  small: 480,
  medium: 768,
  large: 1200,
};

/**
 * Default directories.
 */
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'packages/site/public/assets/images');
const DEFAULT_ORIGINALS_DIR = path.resolve(process.cwd(), 'packages/site/public/assets/originals');

/**
 * Finds all image files in a directory.
 */
function findImageFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    throw new Error(`Image directory does not exist: ${dir}`);
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findImageFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Generates a slug-friendly filename from an image path.
 */
function generateImageSlug(filePath: string): string {
  const name = path.basename(filePath, path.extname(filePath));
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^\-|\-$/g, '');
}

/**
 * Processes images for web optimization.
 *
 * - Converts to WebP format for modern browsers
 * - Generates responsive sizes (small, medium, large)
 * - Preserves original files in separate directory
 * - Generates a manifest of processed images
 */
export async function processScreenshots(
  sourceDir: string,
  outputDir: string = DEFAULT_OUTPUT_DIR,
  originalsDir: string = DEFAULT_ORIGINALS_DIR
): Promise<ScreenshotsResult> {
  const resolvedSourceDir = path.resolve(sourceDir);
  const files = findImageFiles(resolvedSourceDir);

  const result: ScreenshotsResult = {
    processed: [],
    errors: [],
    manifest: [],
  };

  // Ensure output directories exist
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(originalsDir, { recursive: true });

  console.log(`Processing ${files.length} image(s) from ${resolvedSourceDir}`);

  for (const filePath of files) {
    try {
      const slug = generateImageSlug(filePath);
      const ext = path.extname(filePath);

      // Get original image metadata
      const metadata = await sharp(filePath).metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error('Could not determine image dimensions');
      }

      // Copy original to originals directory
      const originalFilename = `${slug}${ext}`;
      const originalOutputPath = path.join(originalsDir, originalFilename);
      fs.copyFileSync(filePath, originalOutputPath);

      const entry: ImageManifestEntry = {
        originalPath: filePath,
        originalName: path.basename(filePath),
        outputPath: outputDir,
        formats: {
          webp: `${slug}.webp`,
          original: originalFilename,
        },
        sizes: {
          small: `${slug}-${SIZES.small}w.webp`,
          medium: `${slug}-${SIZES.medium}w.webp`,
          large: `${slug}-${SIZES.large}w.webp`,
          original: `${slug}.webp`,
        },
        dimensions: {
          width: metadata.width,
          height: metadata.height,
        },
      };

      // Generate WebP version at original size
      await sharp(filePath)
        .webp({ quality: 85 })
        .toFile(path.join(outputDir, entry.sizes.original));

      // Generate responsive sizes (only if smaller than original)
      for (const [sizeName, width] of Object.entries(SIZES)) {
        if (width < metadata.width) {
          const resizedFilename = `${slug}-${width}w.webp`;
          await sharp(filePath)
            .resize(width, null, { withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(path.join(outputDir, resizedFilename));
        } else {
          // Use original size if smaller than target
          entry.sizes[sizeName as keyof typeof SIZES] = entry.sizes.original;
        }
      }

      result.processed.push(entry);
      result.manifest.push(entry);

      console.log(`  ✓ ${path.basename(filePath)} -> ${slug}.webp (${metadata.width}x${metadata.height})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({
        filePath,
        error: errorMessage,
      });
      console.error(`  ✗ ${path.basename(filePath)}: ${errorMessage}`);
    }
  }

  // Write manifest file
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2), 'utf-8');

  console.log(`\nProcessed ${result.processed.length} image(s) with ${result.errors.length} error(s)`);
  console.log(`Manifest written to: ${manifestPath}`);

  return result;
}

/**
 * Generates srcset string for responsive images.
 */
export function generateSrcset(entry: ImageManifestEntry, basePath: string = '/assets/images'): string {
  const sizes: string[] = [];

  for (const [sizeName, width] of Object.entries(SIZES)) {
    const filename = entry.sizes[sizeName as keyof typeof SIZES];
    if (filename !== entry.sizes.original) {
      sizes.push(`${basePath}/${filename} ${width}w`);
    }
  }

  // Add original size
  sizes.push(`${basePath}/${entry.sizes.original} ${entry.dimensions.width}w`);

  return sizes.join(', ');
}
