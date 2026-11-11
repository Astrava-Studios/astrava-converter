#!/usr/bin/env node

/**
 * Astrava Converter — Model Context Protocol (MCP) Server
 * Allows AI agents to convert images (Anything-to-Anything), compress to target MB/KB,
 * resize, inspect metadata, and batch-process directories.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const SERVER_NAME = 'astrava-converter';
const SERVER_VERSION = '1.0.0';

const SUPPORTED_INPUT_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg',
  '.tiff', '.tif', '.bmp', '.ico', '.heic', '.heif', '.jfif'
]);

const SUPPORTED_OUTPUT_FORMATS = [
  'webp', 'jpg', 'jpeg', 'png', 'avif', 'tiff', 'gif', 'bmp', 'ico', 'svg', 'pdf'
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function normalizeFormat(fmt) {
  const clean = String(fmt || 'webp').toLowerCase().replace(/^\./, '');
  if (clean === 'jpeg') return 'jpg';
  if (clean === 'tif') return 'tiff';
  return clean;
}

function parseHexColor(hexStr) {
  const clean = String(hexStr || '#ffffff').replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 255,
      g: parseInt(clean[1] + clean[1], 16) || 255,
      b: parseInt(clean[2] + clean[2], 16) || 255
    };
  }
  return {
    r: parseInt(clean.substring(0, 2), 16) || 255,
    g: parseInt(clean.substring(2, 4), 16) || 255,
    b: parseInt(clean.substring(4, 6), 16) || 255
  };
}

/**
 * Decodes special input formats (like .ico or .bmp) if needed, or passes path/buffer to sharp.
 */
async function createSharpPipeline(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const rawBuffer = await fs.promises.readFile(inputPath);

  // ICO container: extract embedded PNG or BMP if present
  if (ext === '.ico' && rawBuffer.length > 22) {
    const imgSize = rawBuffer.readUInt32LE(14);
    const imgOffset = rawBuffer.readUInt32LE(18);
    if (imgOffset + imgSize <= rawBuffer.length) {
      const slice = rawBuffer.subarray(imgOffset, imgOffset + imgSize);
      // Check PNG magic bytes: 89 50 4E 47
      if (slice[0] === 0x89 && slice[1] === 0x50 && slice[2] === 0x4e && slice[3] === 0x47) {
        return sharp(slice);
      }
    }
  }

  // BMP 24-bit / 32-bit fallback decoder if libvips doesn't directly parse BMP on Windows
  if (ext === '.bmp' && rawBuffer.length > 54 && rawBuffer[0] === 0x42 && rawBuffer[1] === 0x4d) {
    try {
      const testMeta = await sharp(rawBuffer).metadata();
      if (testMeta && testMeta.width) return sharp(rawBuffer);
    } catch {
      const decoded = decodeBmpToRaw(rawBuffer);
      return sharp(decoded.data, {
        raw: { width: decoded.width, height: decoded.height, channels: 4 }
      });
    }
  }

  return sharp(rawBuffer, { animated: false });
}

function decodeBmpToRaw(buf) {
  const pixelOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const bpp = buf.readUInt16LE(28);
  const bytesPerPixel = bpp / 8;
  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;

  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    const rowStart = pixelOffset + srcY * rowStride;
    for (let x = 0; x < width; x++) {
      const srcIdx = rowStart + x * bytesPerPixel;
      const dstIdx = (y * width + x) * 4;
      out[dstIdx] = buf[srcIdx + 2] || 0;     // R
      out[dstIdx + 1] = buf[srcIdx + 1] || 0; // G
      out[dstIdx + 2] = buf[srcIdx] || 0;     // B
      out[dstIdx + 3] = bytesPerPixel === 4 ? buf[srcIdx + 3] : 255;
    }
  }
  return { data: out, width, height };
}

/**
 * Encodes raw RGB/RGBA buffer from sharp into BMP 24-bit format
 */
async function encodeToBmpBuffer(pipeline, bgColorHex) {
  const bg = parseHexColor(bgColorHex);
  const { data, info } = await pipeline
    .flatten({ background: bg })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const rowStride = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowStride * height;
  const fileSize = 54 + pixelArraySize;

  const buffer = Buffer.alloc(fileSize);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(54, 10);

  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(-height, 22); // top-down
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelArraySize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  let offset = 54;
  const padding = rowStride - width * 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      buffer[offset++] = data[idx + 2]; // B
      buffer[offset++] = data[idx + 1]; // G
      buffer[offset++] = data[idx];     // R
    }
    offset += padding;
  }

  return { buffer, width, height };
}

/**
 * Encodes image into ICO container (max 256x256 PNG inside ICO)
 */
async function encodeToIcoBuffer(pipeline) {
  const { data: pngBuf, info } = await pipeline
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(1, 4); // 1 image

  header.writeUInt8(info.width >= 256 ? 0 : info.width, 6);
  header.writeUInt8(info.height >= 256 ? 0 : info.height, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuf.length, 14);
  header.writeUInt32LE(22, 18);

  return {
    buffer: Buffer.concat([header, pngBuf]),
    width: info.width,
    height: info.height
  };
}

/**
 * Encodes image into an embedded SVG wrapper
 */
async function encodeToSvgBuffer(pipeline, quality) {
  const { data: webpBuf, info } = await pipeline
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });

  const b64 = webpBuf.toString('base64');
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}">
  <image width="${info.width}" height="${info.height}" href="data:image/webp;base64,${b64}" />
</svg>`;

  return {
    buffer: Buffer.from(svgStr, 'utf-8'),
    width: info.width,
    height: info.height
  };
}

/**
 * Encodes image into single-page PDF document
 */
async function encodeToPdfBuffer(pipeline, quality, bgColorHex) {
  const bg = parseHexColor(bgColorHex);
  const { data: jpgBuf, info } = await pipeline
    .flatten({ background: bg })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpgBuf);
  const page = pdfDoc.addPage([info.width, info.height]);
  page.drawImage(jpgImage, {
    x: 0,
    y: 0,
    width: info.width,
    height: info.height
  });

  const pdfBytes = await pdfDoc.save();
  return {
    buffer: Buffer.from(pdfBytes),
    width: info.width,
    height: info.height
  };
}

/**
 * Core single-pass encoding given dimensions and quality
 */
async function encodePass(inputPath, options) {
  const {
    format,
    quality = 80,
    width,
    height,
    scalePercent,
    fit = 'inside',
    backgroundColor = '#ffffff'
  } = options;

  const basePipeline = await createSharpPipeline(inputPath);
  const meta = await basePipeline.metadata();
  const origW = meta.width || 800;
  const origH = meta.height || 600;

  let targetW = width ? parseInt(width, 10) : null;
  let targetH = height ? parseInt(height, 10) : null;

  if (scalePercent && scalePercent > 0 && scalePercent !== 100) {
    const ratio = Math.max(0.02, Math.min(2, scalePercent / 100));
    targetW = Math.max(1, Math.round((targetW || origW) * ratio));
    targetH = Math.max(1, Math.round((targetH || origH) * ratio));
  }

  let pipe = await createSharpPipeline(inputPath);
  if (targetW || targetH) {
    pipe = pipe.resize({
      width: targetW || undefined,
      height: targetH || undefined,
      fit: fit || 'inside',
      withoutEnlargement: fit === 'inside'
    });
  }

  const q = Math.max(5, Math.min(100, Math.round(quality)));
  const bg = parseHexColor(backgroundColor);

  switch (format) {
    case 'webp': {
      const { data, info } = await pipe.webp({ quality: q }).toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, origW, origH };
    }
    case 'jpg': {
      const { data, info } = await pipe
        .flatten({ background: bg })
        .jpeg({ quality: q, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, origW, origH };
    }
    case 'png': {
      const { data, info } = await pipe
        .png({ quality: q, compressionLevel: 9, palette: q < 95 })
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, origW, origH };
    }
    case 'avif': {
      const { data, info } = await pipe.avif({ quality: q }).toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, origW, origH };
    }
    case 'tiff': {
      const { data, info } = await pipe.tiff({ quality: q, compression: 'lzw' }).toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, origW, origH };
    }
    case 'gif': {
      const { data, info } = await pipe.gif().toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, origW, origH };
    }
    case 'bmp': {
      const res = await encodeToBmpBuffer(pipe, backgroundColor);
      return { ...res, origW, origH };
    }
    case 'ico': {
      const res = await encodeToIcoBuffer(pipe);
      return { ...res, origW, origH };
    }
    case 'svg': {
      const res = await encodeToSvgBuffer(pipe, q);
      return { ...res, origW, origH };
    }
    case 'pdf': {
      const res = await encodeToPdfBuffer(pipe, q, backgroundColor);
      return { ...res, origW, origH };
    }
    default:
      throw new Error(`Desteklenmeyen hedef format: ${format}`);
  }
}

/**
 * Converts and optionally compresses an image to a strict target KB/MB budget
 */
async function convertAndOptimizeImage(args) {
  const inputPath = path.resolve(args.input_path);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Girdi dosyası bulunamadı: ${inputPath}`);
  }

  const origStats = await fs.promises.stat(inputPath);
  const origSize = origStats.size;

  const targetFormat = normalizeFormat(
    args.output_format ||
    (args.output_path ? path.extname(args.output_path) : 'webp')
  );

  if (!SUPPORTED_OUTPUT_FORMATS.includes(targetFormat)) {
    throw new Error(`Desteklenmeyen çıktı formatı: ${targetFormat}. Desteklenenler: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`);
  }

  const parsedInput = path.parse(inputPath);
  let outputPath = args.output_path
    ? path.resolve(args.output_path)
    : path.join(parsedInput.dir, `${parsedInput.name}.${targetFormat}`);

  // Girdi ve çıktı aynı dosya ise üzerine yazmamak için _astrava ekle (kullanıcı overwrite istemediyse)
  if (path.resolve(outputPath) === inputPath && !args.overwrite) {
    outputPath = path.join(parsedInput.dir, `${parsedInput.name}_converted.${targetFormat}`);
  }

  const targetBytes = args.target_size_mb
    ? Math.round(Number(args.target_size_mb) * 1024 * 1024)
    : args.target_size_kb
      ? Math.round(Number(args.target_size_kb) * 1024)
      : null;

  const autoScale = args.auto_scale !== false;
  let finalResult = null;
  let usedQuality = args.quality || 80;

  if (!targetBytes) {
    finalResult = await encodePass(inputPath, {
      format: targetFormat,
      quality: usedQuality,
      width: args.width,
      height: args.height,
      scalePercent: args.scale_percent,
      fit: args.fit,
      backgroundColor: args.background_color
    });
  } else {
    // Binary search on quality first
    let low = 5;
    let high = 95;
    let bestAttempt = null;

    for (let step = 0; step < 6; step++) {
      const mid = Math.round((low + high) / 2);
      const attempt = await encodePass(inputPath, {
        format: targetFormat,
        quality: mid,
        width: args.width,
        height: args.height,
        scalePercent: args.scale_percent,
        fit: args.fit,
        backgroundColor: args.background_color
      });

      if (attempt.buffer.length <= targetBytes) {
        bestAttempt = { ...attempt, quality: mid };
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (bestAttempt && bestAttempt.buffer.length <= targetBytes) {
      finalResult = bestAttempt;
      usedQuality = bestAttempt.quality;
    } else {
      // Try minimum quality
      const minAttempt = await encodePass(inputPath, {
        format: targetFormat,
        quality: 5,
        width: args.width,
        height: args.height,
        scalePercent: args.scale_percent,
        fit: args.fit,
        backgroundColor: args.background_color
      });
      finalResult = minAttempt;
      usedQuality = 5;

      // If still larger than targetBytes and autoScale is enabled, scale down dimensions
      if (minAttempt.buffer.length > targetBytes && autoScale) {
        const baseScale = args.scale_percent || 100;
        let currentScale = Math.min(90, Math.round(baseScale * Math.sqrt(targetBytes / minAttempt.buffer.length)));

        for (let i = 0; i < 6; i++) {
          currentScale = Math.max(8, currentScale);
          const scaledAttempt = await encodePass(inputPath, {
            format: targetFormat,
            quality: 35,
            width: args.width,
            height: args.height,
            scalePercent: currentScale,
            fit: args.fit,
            backgroundColor: args.background_color
          });
          finalResult = scaledAttempt;
          usedQuality = 35;

          if (scaledAttempt.buffer.length <= targetBytes || currentScale <= 8) {
            break;
          }
          currentScale = Math.floor(currentScale * 0.78);
        }
      }
    }
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, finalResult.buffer);

  const newSize = finalResult.buffer.length;
  const savedBytes = origSize - newSize;
  const savedPercent = origSize > 0 ? Number(((savedBytes / origSize) * 100).toFixed(2)) : 0;

  return {
    success: true,
    tool: 'Astrava Converter MCP',
    input_path: inputPath,
    output_path: outputPath,
    output_format: targetFormat,
    original_size_bytes: origSize,
    original_size_human: formatBytes(origSize),
    output_size_bytes: newSize,
    output_size_human: formatBytes(newSize),
    saved_bytes: savedBytes,
    saved_percent: `${savedPercent}%`,
    original_dimensions: `${finalResult.origW}x${finalResult.origH}`,
    output_dimensions: `${finalResult.width}x${finalResult.height}`,
    applied_quality: usedQuality,
    target_limit_met: targetBytes ? newSize <= targetBytes : true
  };
}

/**
 * Inspects image metadata and dimensions
 */
async function inspectImageInfo(args) {
  const inputPath = path.resolve(args.input_path);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Dosya bulunamadı: ${inputPath}`);
  }

  const stats = await fs.promises.stat(inputPath);
  const pipe = await createSharpPipeline(inputPath);
  const meta = await pipe.metadata();

  return {
    path: inputPath,
    filename: path.basename(inputPath),
    extension: path.extname(inputPath).toLowerCase().replace('.', ''),
    detected_format: meta.format,
    size_bytes: stats.size,
    size_human: formatBytes(stats.size),
    width: meta.width,
    height: meta.height,
    channels: meta.channels,
    space: meta.space,
    has_alpha: meta.hasAlpha,
    density_dpi: meta.density || null
  };
}

/**
 * Batch converts all images in a folder
 */
async function batchConvertDirectory(args) {
  const inputDir = path.resolve(args.input_dir);
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Klasör bulunamadı: ${inputDir}`);
  }

  const outputDir = args.output_dir ? path.resolve(args.output_dir) : path.join(inputDir, 'astrava_converted');
  await fs.promises.mkdir(outputDir, { recursive: true });

  const filterExts = Array.isArray(args.filter_extensions) && args.filter_extensions.length > 0
    ? new Set(args.filter_extensions.map((e) => '.' + String(e).toLowerCase().replace(/^\./, '')))
    : SUPPORTED_INPUT_EXTS;

  const entries = await fs.promises.readdir(inputDir, { withFileTypes: true });
  const imageFiles = entries
    .filter((ent) => ent.isFile() && filterExts.has(path.extname(ent.name).toLowerCase()))
    .map((ent) => path.join(inputDir, ent.name));

  const targetFormat = normalizeFormat(args.output_format || 'webp');
  const results = [];
  let totalOrigBytes = 0;
  let totalNewBytes = 0;

  for (const filePath of imageFiles) {
    const baseName = path.parse(filePath).name;
    const outPath = path.join(outputDir, `${baseName}.${targetFormat}`);
    try {
      const res = await convertAndOptimizeImage({
        input_path: filePath,
        output_path: outPath,
        output_format: targetFormat,
        quality: args.quality,
        target_size_kb: args.target_size_kb,
        target_size_mb: args.target_size_mb,
        width: args.width,
        height: args.height,
        scale_percent: args.scale_percent,
        background_color: args.background_color,
        overwrite: true
      });
      totalOrigBytes += res.original_size_bytes;
      totalNewBytes += res.output_size_bytes;
      results.push(res);
    } catch (err) {
      results.push({
        success: false,
        input_path: filePath,
        error: err.message
      });
    }
  }

  const totalSavedPercent = totalOrigBytes > 0
    ? Number((((totalOrigBytes - totalNewBytes) / totalOrigBytes) * 100).toFixed(2))
    : 0;

  return {
    success: true,
    input_dir: inputDir,
    output_dir: outputDir,
    output_format: targetFormat,
    processed_count: results.length,
    total_original_size: formatBytes(totalOrigBytes),
    total_output_size: formatBytes(totalNewBytes),
    total_saved_percent: `${totalSavedPercent}%`,
    files: results
  };
}

/* ==========================================
   MCP TOOL DEFINITIONS
   ========================================== */

const MCP_TOOLS = [
  {
    name: 'astrava_convert_image',
    description:
      'Astrava Converter (Anything-to-Anything): Converts any image file (JPG, PNG, WEBP, AVIF, HEIC, SVG, GIF, BMP, ICO, TIFF) to any target format (webp, jpg, png, avif, bmp, ico, svg, pdf, tiff, gif) with optional quality control, resizing, and strict MB/KB file size reduction.',
    inputSchema: {
      type: 'object',
      properties: {
        input_path: {
          type: 'string',
          description: 'Absolute or relative path to the source image file'
        },
        output_path: {
          type: 'string',
          description: 'Optional destination file path. If omitted, saves next to input file with the target extension.'
        },
        output_format: {
          type: 'string',
          enum: ['webp', 'jpg', 'png', 'avif', 'bmp', 'ico', 'svg', 'pdf', 'tiff', 'gif'],
          description: 'Target format to convert into (default: webp)'
        },
        quality: {
          type: 'number',
          description: 'Image compression quality from 5 to 100 (default: 80)'
        },
        target_size_kb: {
          type: 'number',
          description: 'Optional strict maximum file size in KB (e.g. 250 for 250 KB). Automatically optimizes quality and resolution to fit under this limit.'
        },
        target_size_mb: {
          type: 'number',
          description: 'Optional strict maximum file size in MB (e.g. 0.5 for 0.5 MB).'
        },
        auto_scale: {
          type: 'boolean',
          description: 'Whether to automatically scale down resolution if minimum quality still exceeds target_size_kb / target_size_mb (default: true)'
        },
        width: {
          type: 'number',
          description: 'Optional target width in pixels'
        },
        height: {
          type: 'number',
          description: 'Optional target height in pixels'
        },
        scale_percent: {
          type: 'number',
          description: 'Optional percentage scale (10 to 100), e.g., 50 for 50% dimensions'
        },
        fit: {
          type: 'string',
          enum: ['inside', 'cover', 'contain', 'fill'],
          description: 'Resize fit mode when width/height are specified (default: inside)'
        },
        background_color: {
          type: 'string',
          description: 'Hex color for transparent background when converting to opaque formats like JPG, BMP, or PDF (default: #ffffff)'
        },
        overwrite: {
          type: 'boolean',
          description: 'Allow overwriting the source file if input_path and output_path are identical'
        }
      },
      required: ['input_path']
    }
  },
  {
    name: 'astrava_compress_to_target_size',
    description:
      'Reduces an image file size to strictly fit under a target MB or KB limit (e.g. under 200 KB or 1 MB) using binary search quality tuning and resolution scaling.',
    inputSchema: {
      type: 'object',
      properties: {
        input_path: {
          type: 'string',
          description: 'Path to the source image file'
        },
        target_size_kb: {
          type: 'number',
          description: 'Maximum file size in Kilobytes (KB), e.g. 200'
        },
        target_size_mb: {
          type: 'number',
          description: 'Maximum file size in Megabytes (MB), e.g. 0.5'
        },
        output_format: {
          type: 'string',
          enum: ['webp', 'jpg', 'png', 'avif', 'pdf'],
          description: 'Optional output format (defaults to webp for maximum size reduction)'
        },
        output_path: {
          type: 'string',
          description: 'Optional output file path'
        }
      },
      required: ['input_path']
    }
  },
  {
    name: 'astrava_batch_convert',
    description:
      'Batch converts and compresses all images in a folder to a target format (webp, jpg, png, avif, ico, pdf, etc.) with optional target KB/MB limits and resizing.',
    inputSchema: {
      type: 'object',
      properties: {
        input_dir: {
          type: 'string',
          description: 'Directory containing source images'
        },
        output_dir: {
          type: 'string',
          description: 'Optional output directory (defaults to <input_dir>/astrava_converted)'
        },
        output_format: {
          type: 'string',
          enum: ['webp', 'jpg', 'png', 'avif', 'bmp', 'ico', 'svg', 'pdf', 'tiff'],
          description: 'Target format for all images (default: webp)'
        },
        quality: {
          type: 'number',
          description: 'Compression quality 5-100 (default: 80)'
        },
        target_size_kb: {
          type: 'number',
          description: 'Optional maximum file size per image in KB'
        },
        target_size_mb: {
          type: 'number',
          description: 'Optional maximum file size per image in MB'
        },
        scale_percent: {
          type: 'number',
          description: 'Optional resolution scale percentage (10-100)'
        },
        width: {
          type: 'number',
          description: 'Optional max width in pixels'
        },
        height: {
          type: 'number',
          description: 'Optional max height in pixels'
        },
        filter_extensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of extensions to include, e.g. ["png", "jpg"]'
        }
      },
      required: ['input_dir']
    }
  },
  {
    name: 'astrava_inspect_image',
    description:
      'Reads metadata of an image file: exact dimensions (width x height), file size (bytes & human-readable), color space, alpha transparency channel, and format.',
    inputSchema: {
      type: 'object',
      properties: {
        input_path: {
          type: 'string',
          description: 'Path to the image file to inspect'
        }
      },
      required: ['input_path']
    }
  }
];

/* ==========================================
   JSON-RPC 2.0 STDIO SERVER LOOP
   ========================================== */

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, code, message, data) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) }
    }) + '\n'
  );
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'astrava_convert_image':
      return await convertAndOptimizeImage(args);
    case 'astrava_compress_to_target_size':
      return await convertAndOptimizeImage({
        ...args,
        output_format: args.output_format || 'webp',
        target_size_kb: args.target_size_kb || (args.target_size_mb ? undefined : 300)
      });
    case 'astrava_batch_convert':
      return await batchConvertDirectory(args);
    case 'astrava_inspect_image':
      return await inspectImageInfo(args);
    default:
      throw new Error(`Bilinmeyen MCP aracı: ${name}`);
  }
}

function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }

    const { id, method, params } = req;

    try {
      switch (method) {
        case 'initialize':
          sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false }
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION
            }
          });
          break;

        case 'notifications/initialized':
        case 'initialized':
          break;

        case 'ping':
          sendResponse(id, {});
          break;

        case 'tools/list':
          sendResponse(id, { tools: MCP_TOOLS });
          break;

        case 'tools/call': {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          const result = await handleToolCall(toolName, toolArgs);
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
          break;
        }

        default:
          if (id !== undefined) {
            sendError(id, -32601, `Method not found: ${method}`);
          }
          break;
      }
    } catch (err) {
      if (id !== undefined) {
        sendError(id, -32000, err.message || 'Internal Astrava MCP error');
      }
    }
  });

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

startMcpServer();
