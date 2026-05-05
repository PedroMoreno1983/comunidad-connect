import OpenAI from 'openai';


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
      // Fallback a una imagen genérica si no hay API Key
      return "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?q=80&w=1000";
    }

    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      console.log(`[ImageService] Generando imagen con DALL-E 3: "${prompt.substring(0, 50)}..."`);
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard", // "standard" es más rápido y barato que "hd"
      });

      if (response.data && response.data[0] && response.data[0].url) {
        return response.data[0].url;
      }
      return null;
    } catch (error) {
      console.error("[ImageService] Error generando imagen con DALL-E 3:", error);
      // Fallback a pollinations si DALL-E falla
      const safePrompt = encodeURIComponent(prompt.substring(0, 100));
      return `https://image.pollinations.ai/prompt/${safePrompt}`;
    }
  }
}
