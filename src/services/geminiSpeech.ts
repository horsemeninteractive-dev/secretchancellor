import { GoogleGenAI, Modality } from "@google/genai";

// Lazy initialization of Gemini AI
let genAI: GoogleGenAI | null = null;

const getGenAI = () => {
  if (!genAI) {
    const apiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined;
    genAI = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return genAI;
};

export type GeminiVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface GeminiSpeechOptions {
  voice?: GeminiVoice;
  text: string;
}

/**
 * Generates audio from text using Gemini 2.5 Flash TTS model.
 * This is a high-quality, free (on free tier) alternative to browser TTS.
 */
export const generateGeminiSpeech = async (options: GeminiSpeechOptions): Promise<HTMLAudioElement | null> => {
  try {
    const { text, voice = 'Kore' } = options;
    const ai = getGenAI();
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      const base64Audio = part.inlineData.data;
      const audioBlob = base64ToBlob(base64Audio, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      return audio;
    }
    
    return null;
  } catch (error) {
    console.error('Gemini TTS Error:', error);
    return null;
  }
};

/**
 * Helper to convert base64 to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Map AI names to Gemini voices for variety
 */
const aiVoiceMap = new Map<string, GeminiVoice>();
const AVAILABLE_VOICES: GeminiVoice[] = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export const getGeminiVoiceForAi = (aiName: string): GeminiVoice => {
  if (aiVoiceMap.has(aiName)) return aiVoiceMap.get(aiName)!;
  
  // Deterministic selection based on name
  let hash = 0;
  for (let i = 0; i < aiName.length; i++) {
    hash = aiName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const voice = AVAILABLE_VOICES[Math.abs(hash) % AVAILABLE_VOICES.length];
  aiVoiceMap.set(aiName, voice);
  return voice;
};
