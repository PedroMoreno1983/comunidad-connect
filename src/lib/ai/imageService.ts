import OpenAI from 'openai';
import { recordAiEvent } from './telemetry';

const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?q=80&w=1200&auto=format&fit=crop";

function clampPrompt(prompt: string) {
  return prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

export class ImageService {
  /**
   * Generates a training image with OpenAI Images.
   * Returns either a remote URL or a base64 data URL, depending on the model.
   */
  static async generateTutorImage(prompt: string): Promise<string | null> {
    const safePrompt = clampPrompt(prompt);

    if (!process.env.OPENAI_API_KEY) {
      console.warn("[ImageService] OPENAI_API_KEY missing. Using curated fallback image.");
      recordAiEvent({
        provider: 'openai',
        feature: 'training.blackboard_image',
        status: 'skipped',
        fallbackUsed: 'unsplash',
        promptChars: safePrompt.length,
        error: 'OPENAI_API_KEY missing',
      });
      return FALLBACK_IMAGE_URL;
    }

    const model = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
    const startedAt = Date.now();

    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await openai.images.generate({
        model,
        prompt: safePrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      } as any);

      const image = response.data?.[0];
      const imageUrl = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null);

      if (imageUrl) {
        recordAiEvent({
          provider: 'openai',
          feature: 'training.blackboard_image',
          status: 'success',
          model,
          latencyMs: Date.now() - startedAt,
          promptChars: safePrompt.length,
        });
        return imageUrl;
      }

      recordAiEvent({
        provider: 'openai',
        feature: 'training.blackboard_image',
        status: 'error',
        model,
        latencyMs: Date.now() - startedAt,
        promptChars: safePrompt.length,
        error: 'OpenAI returned no image data',
      });
      return FALLBACK_IMAGE_URL;
    } catch (error) {
      console.warn(`[ImageService] Image generation failed with ${model}; using fallback image.`, error);
      recordAiEvent({
        provider: 'openai',
        feature: 'training.blackboard_image',
        status: 'fallback',
        model,
        latencyMs: Date.now() - startedAt,
        promptChars: safePrompt.length,
        fallbackUsed: 'pollinations',
        error,
      });
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt.substring(0, 160))}`;
    }
  }
}
