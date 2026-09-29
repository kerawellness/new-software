const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.82;
const MIN_BYTES_TO_COMPRESS = 400_000;

function replaceExtension(filename: string, extension: string) {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return `${base}.${extension}`;
}

function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to compress the photo."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Shrinks education photos before Supabase upload.
 * Videos and PDFs are returned unchanged.
 * If compression fails or does not shrink the file, the original is kept.
 */
export async function compressEducationImageForUpload(file: File): Promise<File> {
  const mimeType = file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return file;
  }
  if (file.size < MIN_BYTES_TO_COMPRESS) {
    return file;
  }

  try {
    const bitmap = await loadImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longestEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longestEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY);
    if (blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
