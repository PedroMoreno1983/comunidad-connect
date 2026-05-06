import OpenAI from 'openai';
import { recordAiEvent } from './telemetry';


export class ImageService {
  /**
   * Genera una imagen usando DALL-E 3 a partir de un prompt descriptivo.
   * Devuelve la URL efímera (dura ~2 horas).
   * 
   * @param prompt Descripción detallada de la imagen a generar
   * @returns URL de la imagen generada, o null si falla
   */
  static async generateTutorImage(prompt: string): Promise<string | null> {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("⚠️ OPENAI_API_KEY no está configurada. Saltando generación de imagen.");
      recordAiEvent({
        provider: 'openai',
        feature: 'training.blackboard_image',
        status: 'skipped',
        fallbackUsed: 'unsplash',
        promptChars: prompt.length,
        error: 'OPENAI_API_KEY missing',
      });
      // Fallback a una imagen genérica si no hay API Key
      return "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?q=80&w=1000";
    }

    const model = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
    const startedAt = Date.now();

    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      console.log(`[ImageService] Generando imagen con ${model}: "${prompt.substring(0, 50)}..."`);
      const response = await openai.images.generate({
        model,
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard", // "standard" es más rápido y barato que "hd"
      });

      if (response.data && response.data[0] && response.data[0].url) {
        recordAiEvent({
          provider: 'openai',
          feature: 'training.blackboard_image',
          status: 'success',
          model,
          latencyMs: Date.now() - startedAt,
          promptChars: prompt.length,
        });
        return response.data[0].url;
      }
      recordAiEvent({
        provider: 'openai',
        feature: 'training.blackboard_image',
        status: 'error',
        model,
        latencyMs: Date.now() - startedAt,
        promptChars: prompt.length,
        error: 'OpenAI returned no image URL',
      });
      return null;
    } catch (error) {
      console.error(`[ImageService] Error generando imagen con ${model}:`, error);
      recordAiEvent({
        provider: 'openai',
        feature: 'training.blackboard_image',
        status: 'fallback',
        model,
        latencyMs: Date.now() - startedAt,
        promptChars: prompt.length,
        fallbackUsed: 'pollinations',
        error,
      });
      // Fallback a pollinations si DALL-E falla
      const safePrompt = encodeURIComponent(prompt.substring(0, 100));
      return `https://image.pollinations.ai/prompt/${safePrompt}`;
    }
  }
}
