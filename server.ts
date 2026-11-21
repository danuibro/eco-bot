import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';
import type {WasteAnalysisResponse, WasteCategory} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const VALID_CATEGORIES = new Set<WasteCategory>([
  'COMPOST',
  'RECYCLING',
  'TRASH',
  'CHECK FIRST',
]);

const ECOBOT_SYSTEM_INSTRUCTION = `You are EcoBot, a friendly and knowledgeable food waste sorting assistant for students, designed to integrate with EcoScrap.

Your task is to analyze photographs of student meals, leftovers, snacks, food scraps, and packaging, and provide accurate, educational, school-bin-oriented waste sorting guidance.

CRITICAL RULES:
1. CLARITY CHECK FIRST:
   - If the image is too blurry, dark, obstructed, heavily cropped, or does not clearly show food, drink containers, or packaging items well enough to identify them responsibly, set "isUnclear" to true, return an empty "items" array, and write a helpful "unclearMessage" politely asking the student to upload a clearer, well-lit photo instead of guessing.
   - If the image shows no food waste or packaging at all (e.g. an empty desk, landscape, or unrelated object), set "isUnclear" to true and gently ask the student to take or upload a photo of their leftovers or food packaging.

2. IDENTIFY EVERY VISIBLE ITEM:
   - When the photo is clear ("isUnclear": false), identify EVERY visible food item, food scrap, beverage container, utensil, napkin, lid, straw, and wrapper/packaging in the foreground/tray/table that the student needs to dispose of.
   - Do not skip small items like plastic caps, straws, crumpled napkins, or foil wrappers if they are clearly visible as waste items.

3. STRICT CLASSIFICATION CATEGORIES:
   Classify every identified item into exactly one of these four categories:
   - "COMPOST": Food scraps (fruit cores, peels, bread, vegetables, leftovers) and plain, unbleached/uncoated paper napkins or food-soiled plain paper towels that are standardly accepted by school composting programs.
   - "RECYCLING": Clean, empty recyclable materials accepted by standard school recycling programs (such as empty rigid plastic bottles, clean aluminum cans, clean ungreased cardboard/paper). Note if liquid/food must be emptied or rinsed first!
   - "TRASH": Materials that belong in general landfill waste (multi-layer foil/plastic wrappers, chip bags, plastic straws, plastic utensils, Styrofoam, heavily soiled/waxed packaging).
   - "CHECK FIRST": Items whose disposal category cannot be confidently determined from the image OR where acceptance depends on the specific school's hauling rules (e.g., cups/utensils labeled "compostable" or "biodegradable" that may be PLA bioplastic, plastic-lined paper coffee cups, greasy pizza boxes where some schools compost cardboard and others trash it, unclear resin codes, or partially hidden items).

4. ACCURACY & ANTI-GREENWASHING DISCIPLINE:
   - Distinguish clearly between technically/industrially compostable materials and materials actually accepted by typical school composting programs.
   - NEVER classify plastic or bioplastic as "COMPOST" just because it looks plant-based or might be labeled "biodegradable" or "compostable". Classify ambiguous bioplastics as "CHECK FIRST" (or "TRASH" if clearly conventional single-use plastic) and explain why in plain terms.
   - NEVER assume that all paper, cups, wrappers, or packaging are recyclable. Coffee cups are often plastic-lined, granola wrappers are often foil-lined multi-layer plastic, and greasy cardboard may contaminate recycling streams.

5. USF TAMPA DORM BIN GUIDANCE (NO FABRICATED FLOOR/ROOM DETAILS):
   - The student may select their USF Tampa campus residence hall (e.g., "Juniper-Poplar Hall", "Beacon Hall", "Horizon Hall", etc.).
   - For "schoolBin", specify the bin stream at that dorm (e.g., "Juniper-Poplar Hall Compost Bin", "Juniper-Poplar Hall Recycling Bin (Empty & rinse first)", "Juniper-Poplar Hall Trash Bin", or "Check Juniper-Poplar Hall Bin Signage First"). If no specific dorm is provided, say "USF Tampa Dorm Compost Bin", "USF Tampa Dorm Recycling Bin", etc.
   - NEVER invent room numbers, floor numbers, or specific hallway directions.

6. CONCISE EXPLANATION & SUMMARY:
   - Keep every field brief and easy to scan while standing at the dorm bins.
   - For each item's "explanation", write ONE short, clear sentence explaining why it goes in that bin.
   - For "diversionSummary", write ONE short sentence summarizing how much of the waste can be composted or recycled.
   - For "environmentalTip", provide ONE brief, practical tip (1 sentence).`;

let cachedAiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as {status?: unknown}).status)
          : undefined;
      const isRetryable = status === 429 || (status !== undefined && status >= 500);
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 400 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function normalizeAnalysisPayload(raw: unknown, dormLabel: string): WasteAnalysisResponse {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const isUnclear = Boolean(obj.isUnclear);
  const unclearMessage =
    typeof obj.unclearMessage === 'string' && obj.unclearMessage.trim().length > 0
      ? obj.unclearMessage.trim()
      : 'This photo is a bit unclear for me to identify everything safely. Please try taking or uploading a brighter, closer photo of your leftovers.';

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items = isUnclear
    ? []
    : rawItems
        .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
        .map((entry) => {
          const rawClass = String(entry.classification || 'CHECK FIRST').toUpperCase().trim() as WasteCategory;
          const classification: WasteCategory = VALID_CATEGORIES.has(rawClass)
            ? rawClass
            : 'CHECK FIRST';
          return {
            name: String(entry.name || 'Unidentified item').trim(),
            classification,
            schoolBin: String(
              entry.schoolBin ||
                (classification === 'COMPOST'
                  ? `${dormLabel} Compost Bin`
                  : classification === 'RECYCLING'
                    ? `${dormLabel} Recycling Bin`
                    : classification === 'TRASH'
                      ? `${dormLabel} Trash Bin`
                      : `Check ${dormLabel} Bin Signage`)
            ).trim(),
            explanation: String(
              entry.explanation || 'Check the disposal label and dorm bin guide before sorting.'
            ).trim(),
          };
        });

  const diversionSummary =
    typeof obj.diversionSummary === 'string' && obj.diversionSummary.trim().length > 0
      ? obj.diversionSummary.trim()
      : isUnclear
        ? 'Upload a clearer photo so EcoBot can tell you what goes in compost, recycling, and trash.'
        : 'Sort each item into the matching dorm bin above.';

  const environmentalTip =
    typeof obj.environmentalTip === 'string' && obj.environmentalTip.trim().length > 0
      ? obj.environmentalTip.trim()
      : 'Empty leftover liquids before recycling so bottles and cans stay clean.';

  return {
    isUnclear,
    unclearMessage,
    items,
    diversionSummary,
    environmentalTip,
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({limit: '16mb'}));

  app.get('/api/health', (_req, res) => {
    res.json({ok: true, service: 'ecobot-scanner'});
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const body = req.body as
        | {imageBase64?: unknown; mimeType?: unknown; dormLocation?: unknown}
        | undefined;
      if (!body || typeof body.imageBase64 !== 'string' || typeof body.mimeType !== 'string') {
        res.status(400).json({error: 'Please provide a valid image payload (imageBase64 and mimeType).'});
        return;
      }

      const dormLabel =
        typeof body.dormLocation === 'string' && body.dormLocation.trim().length > 0
          ? body.dormLocation.trim().slice(0, 80)
          : 'USF Tampa Dorm';

      const normalizedMime = body.mimeType.toLowerCase().split(';')[0].trim();
      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        res.status(400).json({
          error: `Unsupported image format "${normalizedMime}". Please upload a JPEG, PNG, or WebP photo.`,
        });
        return;
      }

      const base64Data = body.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
      if (!base64Data || base64Data.length < 64) {
        res.status(400).json({error: 'The uploaded image appears empty or corrupted.'});
        return;
      }

      const approxBytes = Math.floor((base64Data.length * 3) / 4);
      if (approxBytes > 12 * 1024 * 1024) {
        res.status(413).json({error: 'Image is too large (max 12 MB). Please choose a smaller photo.'});
        return;
      }

      const ai = getAiClient();
      const startedAt = Date.now();

      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime,
                  data: base64Data,
                },
              },
              {
                text: `The student is sorting waste at: ${dormLabel} (USF Tampa campus). Analyze this food/waste photograph, identify every visible item, classify each into COMPOST, RECYCLING, TRASH, or CHECK FIRST, tell them which ${dormLabel} bin to use, and keep explanations concise.`,
              },
            ],
          },
          config: {
            systemInstruction: ECOBOT_SYSTEM_INSTRUCTION,
            thinkingConfig: {thinkingLevel: ThinkingLevel.MINIMAL},
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isUnclear: {
                  type: Type.BOOLEAN,
                  description:
                    'True if the image is too blurry, dark, obstructed, or lacks visible food/packaging items to identify reliably.',
                },
                unclearMessage: {
                  type: Type.STRING,
                  description:
                    'Friendly message asking the student to upload a clearer photo when isUnclear is true; empty string otherwise.',
                },
                items: {
                  type: Type.ARRAY,
                  description: 'Every visible food item, food scrap, or piece of packaging identified in the image.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: 'Specific name of the visible item.',
                      },
                      classification: {
                        type: Type.STRING,
                        description: 'Must be exactly one of: COMPOST, RECYCLING, TRASH, CHECK FIRST',
                      },
                      schoolBin: {
                        type: Type.STRING,
                        description:
                          'Which specific school bin stream to use without inventing building or room locations.',
                      },
                      explanation: {
                        type: Type.STRING,
                        description: 'A single clear sentence explaining why the item belongs in this category.',
                      },
                    },
                    required: ['name', 'classification', 'schoolBin', 'explanation'],
                  },
                },
                diversionSummary: {
                  type: Type.STRING,
                  description:
                    'Short summary of how much of the photographed waste can be composted or recycled.',
                },
                environmentalTip: {
                  type: Type.STRING,
                  description: 'Short, helpful environmental tip tailored to the items photographed.',
                },
              },
              required: ['isUnclear', 'unclearMessage', 'items', 'diversionSummary', 'environmentalTip'],
            },
          },
        })
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({error: 'EcoBot received an empty analysis from Gemini. Please try again.'});
        return;
      }

      const parsed = JSON.parse(rawText) as unknown;
      const normalized = normalizeAnalysisPayload(parsed, dormLabel);
      console.log(`[analyze] dorm="${dormLabel}" bytes=${approxBytes} ms=${Date.now() - startedAt} items=${normalized.items.length}`);
      res.json(normalized);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'GEMINI_API_KEY_MISSING') {
        res.status(500).json({
          error: 'Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      console.error('Error analyzing image with Gemini:', err);
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as {status?: unknown}).status)
          : 500;
      if (status === 400 || status === 403) {
        res.status(status).json({
          error: 'Gemini API request was rejected. Please verify your GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (status === 429) {
        res.status(429).json({
          error: 'EcoBot is receiving a lot of scans right now. Please wait a few seconds and try again.',
        });
        return;
      }
      res.status(500).json({
        error: 'Unable to analyze this image right now. Please try again in a moment.',
      });
    }
  });

  if (!IS_PROD) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EcoBot server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
