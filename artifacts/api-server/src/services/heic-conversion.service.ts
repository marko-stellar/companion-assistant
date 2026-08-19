import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { ObjectStorageService } from "../lib/objectStorage";

const execFile = promisify(execFileCallback);
const HEIC_CONTENT_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_FILENAME = /\.(heic|heif)$/i;

export class HeicConversionError extends Error {
  constructor() {
    super("The HEIC image could not be converted.");
    this.name = "HeicConversionError";
  }
}

export function isHeicImage(contentType?: string | null, filename?: string | null): boolean {
  return (
    HEIC_CONTENT_TYPES.has(contentType?.toLowerCase() ?? "") ||
    HEIC_FILENAME.test(filename ?? "")
  );
}

function jpegFilename(filename?: string | null): string {
  if (!filename) return "photo.jpg";
  if (HEIC_FILENAME.test(filename)) return filename.replace(HEIC_FILENAME, ".jpg");
  return `${filename}.jpg`;
}

/**
 * iPhone HEIC/HEIF files are not consistently renderable in browsers or vision
 * providers. Convert them in a temporary directory, then overwrite the uploaded
 * private object with a display-safe JPEG before it is registered in the gallery.
 */
export class HeicConversionService {
  constructor(private readonly objectStorageService = new ObjectStorageService()) {}

  async convertIfNeeded(input: {
    objectPath: string;
    contentType?: string | null;
    filename?: string | null;
    sizeBytes?: number | null;
  }): Promise<{
    contentType: string | null;
    filename: string | null;
    sizeBytes: number | null;
    converted: boolean;
  }> {
    if (!isHeicImage(input.contentType, input.filename)) {
      return {
        contentType: input.contentType ?? null,
        filename: input.filename ?? null,
        sizeBytes: input.sizeBytes ?? null,
        converted: false,
      };
    }

    const temporaryDir = await mkdtemp(join(tmpdir(), "companion-heic-"));
    try {
      const source = await this.objectStorageService.getObjectEntityFile(input.objectPath);
      const [sourceBytes] = await source.download();
      const inputPath = join(temporaryDir, "source.heic");
      const outputPath = join(temporaryDir, "converted.jpg");

      await writeFile(inputPath, sourceBytes);
      await execFile(
        "magick",
        [inputPath, "-auto-orient", "-strip", "-quality", "92", outputPath],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      );

      const jpegBytes = await readFile(outputPath);
      if (jpegBytes.length === 0) {
        throw new Error("ImageMagick produced an empty JPEG");
      }

      await source.save(jpegBytes, {
        resumable: false,
        metadata: { contentType: "image/jpeg" },
      });

      return {
        contentType: "image/jpeg",
        filename: jpegFilename(input.filename),
        sizeBytes: jpegBytes.byteLength,
        converted: true,
      };
    } catch (error) {
      if (error instanceof HeicConversionError) throw error;
      throw new HeicConversionError();
    } finally {
      await rm(temporaryDir, { recursive: true, force: true });
    }
  }
}

export const heicConversionService = new HeicConversionService();