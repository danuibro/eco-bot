export interface PreparedImage {
  previewUrl: string;
  base64Data: string;
  mimeType: string;
  width: number;
  height: number;
  label: string;
}

const MAX_DIMENSION = 1024;

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image data.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read the selected image file.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Browser could not decode this image format.'));
    img.src = src;
  });
}

export async function prepareFileForAnalysis(file: File): Promise<PreparedImage> {
  const rawDataUrl = await readBlobAsDataUrl(file);
  const label = file.name || 'Captured photo';

  try {
    const img = await loadImageElement(rawDataUrl);
    const origWidth = img.naturalWidth || 0;
    const origHeight = img.naturalHeight || 0;

    if (origWidth === 0 || origHeight === 0) {
      throw new Error('Empty image dimensions');
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(origWidth, origHeight));
    const targetWidth = Math.max(1, Math.round(origWidth * scale));
    const targetHeight = Math.max(1, Math.round(origHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      const base64Fallback = rawDataUrl.split(',')[1] || '';
      return {
        previewUrl: rawDataUrl,
        base64Data: base64Fallback,
        mimeType: file.type || 'image/jpeg',
        width: origWidth,
        height: origHeight,
        label,
      };
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const outputMime = 'image/jpeg';
    const compressedDataUrl = canvas.toDataURL(outputMime, 0.8);
    const base64Data = compressedDataUrl.split(',')[1] || '';

    return {
      previewUrl: compressedDataUrl,
      base64Data,
      mimeType: outputMime,
      width: targetWidth,
      height: targetHeight,
      label,
    };
  } catch {
    // Fallback for formats the browser canvas cannot decode natively (e.g. HEIC on some desktop browsers)
    const base64Data = rawDataUrl.split(',')[1] || '';
    const mimeType = file.type || 'image/jpeg';
    return {
      previewUrl: rawDataUrl,
      base64Data,
      mimeType,
      width: 0,
      height: 0,
      label,
    };
  }
}

export async function prepareUrlForAnalysis(url: string, label: string): Promise<PreparedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load the sample photo.');
  }
  const blob = await response.blob();
  const file = new File([blob], `${label.toLowerCase().replace(/\s+/g, '_')}.jpg`, {
    type: blob.type || 'image/jpeg',
  });
  const prepared = await prepareFileForAnalysis(file);
  return {
    ...prepared,
    label,
  };
}
