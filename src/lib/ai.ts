import { Sentry } from "./sentry";
import { AI_ENDPOINT, HEIC_TO_URL } from "./origin";

const AI_MODEL = "default";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
};

type CompletionOptions = {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  response_format?: { type: string };
};

export async function chatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<string> {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: AI_MODEL, messages, ...options }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function safeJsonCompletion<T = unknown>(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<T> {
  const raw = await chatCompletion(messages, options);
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error(`Expected JSON but got: ${raw.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("unreachable");
}

// --- File encoding helpers ---

const VISION_SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function needsImageConversion(file: File): boolean {
  if (VISION_SUPPORTED_TYPES.has(file.type)) return false;
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "heic" || ext === "heif";
}

function canvasConvertToJpeg(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Image conversion failed")); return; }
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Browser cannot decode this image natively"));
    };
    img.src = url;
  });
}

/** Guards for the external HEIC converter. It runs libheif in a blob-URL Web
 *  Worker; if a CSP or an ad/privacy blocker kills that worker, the underlying
 *  promise can hang forever (no resolve, no reject) — leaving the user on an
 *  infinite spinner. A timeout turns that hang into a reportable error. */
const HEIC_SCRIPT_TIMEOUT_MS = 30000;
const HEIC_DECODE_TIMEOUT_MS = 30000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Report an image-conversion failure to Sentry with enough context to tell
 *  browsers/formats apart later (captureException is a safe no-op when Sentry
 *  has no DSN). Telemetry must never break the conversion path itself. */
function reportConversionFailure(step: string, file: File, err: unknown): void {
  try {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { source: "image_conversion", step },
      contexts: {
        upload: {
          fileType: file.type || "(empty)",
          fileName: file.name,
          fileSizeKb: Math.round(file.size / 1024),
        },
      },
    });
  } catch {
    /* Sentry unavailable */
  }
}

let heicToLoaded: Promise<void> | null = null;

function loadHeicTo(): Promise<void> {
  if (heicToLoaded) return heicToLoaded;
  heicToLoaded = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = HEIC_TO_URL;
    s.onload = () => resolve();
    s.onerror = () => {
      heicToLoaded = null;
      reject(new Error("Failed to load HEIC converter"));
    };
    document.head.appendChild(s);
  });
  return heicToLoaded;
}

async function heicFallbackConvert(file: File): Promise<File> {
  await withTimeout(loadHeicTo(), HEIC_SCRIPT_TIMEOUT_MS, "HEIC converter download");
  const HT = (window as any).HeicTo;
  if (!HT) throw new Error("HEIC converter not available");
  const blob: Blob = await withTimeout(
    HT({ blob: file, type: "image/jpeg", quality: 0.92 }),
    HEIC_DECODE_TIMEOUT_MS,
    "HEIC decode",
  );
  const name = file.name.replace(/\.[^.]+$/, ".jpg");
  return new File([blob], name, { type: "image/jpeg" });
}

async function convertToJpeg(file: File): Promise<File> {
  try {
    return await canvasConvertToJpeg(file);
  } catch {
    // Non-Safari browsers can't decode HEIC natively and fall back to the
    // external libheif converter. If THAT also fails (blocked script, CSP-killed
    // worker, timeout), report it with context and surface an actionable message
    // instead of a silent failure or an infinite spinner.
    try {
      return await heicFallbackConvert(file);
    } catch (err) {
      reportConversionFailure("heic_fallback", file, err);
      throw new Error(
        "Could not convert this photo. HEIC images are supported natively only in " +
        "Safari — please re-upload it as JPEG (on iPhone: Settings > Camera > Formats " +
        "> 'Most Compatible') or open this dashboard in Safari.",
      );
    }
  }
}

/** Ensures a file is a server-acceptable image before it hits POST /files.
 *  The Living-Apps upload endpoint decodes every image server-side and 500s on
 *  HEIC ("cannot identify image file") — so HEIC/HEIF from an iPhone is
 *  converted to JPEG in the browser FIRST (same Safari-canvas → libheif path as
 *  the AI photo scan). Non-image files and already-web-safe images pass through
 *  untouched. Throws an actionable Error if conversion fails (surface it in the
 *  upload UI, don't swallow it). */
export async function ensureUploadableImage(file: File): Promise<File> {
  if (!needsImageConversion(file)) return file;
  return convertToJpeg(file);
}

function readExifFromJpeg(buf: ArrayBuffer): DataView | null {
  const view = new DataView(buf);
  if (view.getUint16(0) !== 0xFFD8) return null;
  let offset = 2;
  while (offset < view.byteLength - 4) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) {
      const len = view.getUint16(offset + 2);
      const exifStart = offset + 4;
      if (exifStart + 6 <= buf.byteLength
          && view.getUint32(exifStart) === 0x45786966
          && view.getUint16(exifStart + 4) === 0x0000) {
        return new DataView(buf, exifStart + 6, len - 8);
      }
    }
    if ((marker & 0xFF00) !== 0xFF00) break;
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

function readExifFromHeic(buf: ArrayBuffer): DataView | null {
  const view = new DataView(buf);
  for (let s = 0; s < view.byteLength - 14; s++) {
    if (view.getUint32(s) === 0x45786966 && view.getUint16(s + 4) === 0x0000) {
      const t = s + 6;
      const bo = view.getUint16(t);
      if ((bo === 0x4949 || bo === 0x4D4D) && view.getUint16(t + 2, bo === 0x4949) === 42) {
        return new DataView(buf, t);
      }
    }
  }
  return null;
}

function parseExifMeta(tiff: DataView): {
  gps: { latitude: number; longitude: number } | null;
  dateTime: string | null;
} | null {
  const len = tiff.byteLength;
  if (len < 8) return null;
  const le = tiff.getUint16(0) === 0x4949;
  const g16 = (o: number) => o + 2 <= len ? tiff.getUint16(o, le) : 0;
  const g32 = (o: number) => o + 4 <= len ? tiff.getUint32(o, le) : 0;
  const rational = (o: number) => { const n = g32(o), d = g32(o + 4); return d ? n / d : 0; };
  const ascii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n - 1 && o + i < len; i++) s += String.fromCharCode(tiff.getUint8(o + i));
    return s;
  };

  const ifdOffset = g32(4);
  if (!ifdOffset || ifdOffset + 2 > len) return null;
  const count = g16(ifdOffset);
  if (ifdOffset + 2 + count * 12 > len) return null;

  let gpsOffset = 0, exifIfdOffset = 0, ifd0DateTime = "";
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = g16(entry);
    if (tag === 0x8825) gpsOffset = g32(entry + 8);
    if (tag === 0x8769) exifIfdOffset = g32(entry + 8);
    if (tag === 0x0132) {
      const cnt = g32(entry + 4);
      const off = g32(entry + 8);
      if (cnt >= 19 && off + cnt <= len) ifd0DateTime = ascii(off, cnt);
    }
  }

  let dateTime: string | null = null;
  if (exifIfdOffset && exifIfdOffset + 2 <= len) {
    const exifCount = g16(exifIfdOffset);
    if (exifIfdOffset + 2 + exifCount * 12 <= len) {
      for (let i = 0; i < exifCount; i++) {
        const entry = exifIfdOffset + 2 + i * 12;
        if (g16(entry) === 0x9003) {
          const cnt = g32(entry + 4);
          const off = g32(entry + 8);
          if (cnt >= 19 && off + cnt <= len) dateTime = ascii(off, cnt);
          break;
        }
      }
    }
  }
  if (!dateTime && ifd0DateTime) dateTime = ifd0DateTime;

  let gps: { latitude: number; longitude: number } | null = null;
  if (gpsOffset && gpsOffset + 2 <= len) {
    const gpsCount = g16(gpsOffset);
    if (gpsOffset + 2 + gpsCount * 12 <= len) {
      let latRef = "", lngRef = "";
      let latOff = 0, lngOff = 0;
      for (let i = 0; i < gpsCount; i++) {
        const entry = gpsOffset + 2 + i * 12;
        const tag = g16(entry);
        if (tag === 1) latRef = String.fromCharCode(tiff.getUint8(entry + 8));
        if (tag === 2) latOff = g32(entry + 8);
        if (tag === 3) lngRef = String.fromCharCode(tiff.getUint8(entry + 8));
        if (tag === 4) lngOff = g32(entry + 8);
      }
      if (latOff && lngOff && latOff + 24 <= len && lngOff + 24 <= len) {
        const toDec = (off: number) => rational(off) + rational(off + 8) / 60 + rational(off + 16) / 3600;
        let latitude = toDec(latOff);
        let longitude = toDec(lngOff);
        if (latRef === "S") latitude = -latitude;
        if (lngRef === "W") longitude = -longitude;
        gps = { latitude, longitude };
      }
    }
  }

  if (!gps && !dateTime) return null;
  return { gps, dateTime };
}

export async function extractPhotoMeta(file: File): Promise<{
  gps: { latitude: number; longitude: number } | null;
  dateTime: string | null;
} | null> {
  try {
    const buf = await file.arrayBuffer();
    const tiff = readExifFromJpeg(buf) ?? readExifFromHeic(buf);
    if (!tiff) return null;
    return parseExifMeta(tiff);
  } catch {
    return null;
  }
}

export type ReverseGeocodeResult = {
  /** Full human-readable address — fits GeoLocation.info. */
  display: string;
  /** Address components (Nominatim may omit any). Map these onto separate
   *  address fields if the app has them (street / no. / zip / city). */
  road?: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
};

/** Reverse-geocode coordinates → a STRUCTURED address. `addressdetails=1` adds
 *  the component breakdown, so a consumer can pre-fill separate fields (street,
 *  zip, city) in addition to the full string. All components are optional. */
export async function reverseGeocodeDetailed(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}&accept-language=${navigator.language}`
    );
    const data = await res.json();
    const a = data.address ?? {};
    return {
      display: data.display_name ?? "",
      road: a.road ?? a.pedestrian ?? a.footway,
      houseNumber: a.house_number,
      postcode: a.postcode,
      city: a.city ?? a.town ?? a.village ?? a.municipality,
    };
  } catch {
    return { display: "" };
  }
}

/** Backwards-compatible string form (the full address — for GeoLocation.info). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  return (await reverseGeocodeDetailed(lat, lng)).display;
}

/** FORWARD geocode: a free address string → the single best coordinate. Uses
 *  Photon (Komoot/OSM) — the SAME source AddressAutocomplete uses, key-free and
 *  built for search (unlike Nominatim, whose policy forbids per-keystroke use).
 *  Returns null when nothing matches or the request was aborted. Forward
 *  geocoding is inherently APPROXIMATE (an address resolves to one of several
 *  candidates) — the caller should pair it with a visible, draggable map pin so
 *  the result is confirmable, never write it silently as ground truth. */
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal,
): Promise<{ lat: number; long: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  try {
    const lang = (navigator.language || "de").slice(0, 2);
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=${lang}`,
      { signal }
    );
    const data = await res.json();
    const feat = data?.features?.[0];
    const coords = feat?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const [long, lat] = coords as [number, number];   // GeoJSON order is [long, lat]
    if (typeof lat !== "number" || typeof long !== "number" || !Number.isFinite(lat) || !Number.isFinite(long)) return null;
    const p = feat.properties ?? {};
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const label = [street || p.name, [p.postcode, p.city].filter(Boolean).join(" "), p.country]
      .filter(Boolean)
      .join(", ") || q;
    return { lat, long, label };
  } catch {
    return null;
  }
}

export async function fileToDataUri(file: File): Promise<string> {
  let f = file;
  if (needsImageConversion(f)) {
    f = await convertToJpeg(f);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(f);
  });
}

export async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to encode file"));
    reader.readAsDataURL(blob);
  });
}

/** Convert a data URI back to a Blob (for file uploads) */
export function dataUriToBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Synthesize a filename from a data URI's MIME type. OpenAI requires a
 *  `filename` on every `file` content part (it derives the extension from it),
 *  and the Responses API rejects the part outright without one — so a PDF sent
 *  as `{ file: { file_data } }` alone fails with "Missing required parameter".
 *  The name is only a hint for the MIME/extension, so a synthetic one is fine. */
function filenameForDataUri(dataUri: string, base = "document"): string {
  const mime = dataUri.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  const ext = mime.split("/")[1]?.split("+")[0] ?? "bin";
  return `${base}.${ext}`;
}

// --- High-level AI features ---

export async function classify(
  text: string,
  categories: string[]
): Promise<{ category: string; confidence: number }> {
  return safeJsonCompletion([
    {
      role: "system",
      content: [
        "You are a classifier. Respond ONLY with valid JSON, nothing else.",
        'Output format: {"category": "<one of the allowed categories>", "confidence": <0-1>}',
        `Allowed categories: ${JSON.stringify(categories)}`,
      ].join("\n"),
    },
    { role: "user", content: text },
  ], { temperature: 0 });
}

export async function extract<T = Record<string, unknown>>(
  text: string,
  schemaDescription: string
): Promise<T> {
  return safeJsonCompletion([
    {
      role: "system",
      content: [
        "You are a data extraction engine. Respond ONLY with valid JSON matching the requested schema.",
        "If a field cannot be determined from the input, use null.",
        `Schema:\n${schemaDescription}`,
      ].join("\n"),
    },
    { role: "user", content: text },
  ], { temperature: 0 });
}

export async function summarize(
  text: string,
  options: { maxSentences?: number; language?: string } = {}
): Promise<string> {
  const { maxSentences = 3, language } = options;
  const instructions = [
    `Summarize the following text in at most ${maxSentences} sentences.`,
    "Be concise and preserve key facts.",
  ];
  if (language) instructions.push(`Write the summary in ${language}.`);
  return chatCompletion([
    { role: "system", content: instructions.join(" ") },
    { role: "user", content: text },
  ]);
}

export async function translate(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  const from = sourceLanguage ? ` from ${sourceLanguage}` : "";
  return chatCompletion([
    {
      role: "system",
      content: `Translate the following text${from} to ${targetLanguage}. Output ONLY the translation, nothing else.`,
    },
    { role: "user", content: text },
  ]);
}

export async function analyzeImage(imageDataUri: string, prompt: string): Promise<string> {
  return chatCompletion([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUri } },
      ],
    },
  ]);
}

export async function analyzeDocument(fileDataUri: string, prompt: string): Promise<string> {
  return chatCompletion([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "file", file: { filename: filenameForDataUri(fileDataUri), file_data: fileDataUri } },
      ],
    },
  ]);
}

export async function extractFromInput<T = Record<string, unknown>>(
  schemaDescription: string,
  options: {
    dataUri?: string;
    userText?: string;
    photoContext?: string;
    intent?: string;
  } = {}
): Promise<T> {
  const { dataUri, userText, photoContext, intent } = options;
  const hasMedia = !!dataUri;
  const hasText = !!userText?.trim();
  if (!hasMedia && !hasText) {
    throw new Error("Either dataUri or userText must be provided");
  }
  const isImage = hasMedia && dataUri!.startsWith("data:image/");
  const mediaLabel = isImage ? "image" : "document";
  const systemParts: string[] = [];
  if (hasMedia && hasText) {
    systemParts.push(
      "Extract structured data from the provided " + mediaLabel + " and the user's text input.",
      "The user's text may contain data to extract, additional context about the " + mediaLabel + ", specific instructions, or any combination. Use ALL provided information to fill the schema fields."
    );
  } else if (hasMedia) {
    systemParts.push("Extract structured data from the provided " + mediaLabel + ".");
  } else {
    systemParts.push(
      "Extract structured data from the user's text input.",
      "The text may contain raw data, structured information, notes, emails, descriptions, or instructions. Extract all relevant information that matches the schema fields."
    );
  }
  systemParts.push("Respond ONLY with valid JSON matching the schema.");
  systemParts.push("Use null for any field that cannot be determined.");
  if (intent) {
    systemParts.push(`<user-intent>${intent}</user-intent>`);
  }
  if (photoContext) {
    systemParts.push(photoContext);
  }
  systemParts.push(`Schema:\n${schemaDescription}`);
  const userContent: Array<{ type: string; [key: string]: unknown }> = [];
  const textParts: string[] = [];
  if (hasMedia) {
    textParts.push("Extract the data from this " + mediaLabel + ".");
  }
  if (hasText) {
    textParts.push(`<user-input>\n${userText!.trim()}\n</user-input>`);
  }
  userContent.push({ type: "text", text: textParts.join("\n") });
  if (hasMedia) {
    userContent.push(
      isImage
        ? { type: "image_url", image_url: { url: dataUri! } }
        : { type: "file", file: { filename: filenameForDataUri(dataUri!), file_data: dataUri! } }
    );
  }
  return safeJsonCompletion([
    { role: "system", content: systemParts.join("\n") },
    { role: "user", content: userContent },
  ]);
}

/** @deprecated Use extractFromInput instead */
export const extractFromPhoto = <T = Record<string, unknown>>(
  dataUri: string,
  schemaDescription: string,
  photoContext?: string,
  intent?: string
) => extractFromInput<T>(schemaDescription, { dataUri, photoContext, intent });
