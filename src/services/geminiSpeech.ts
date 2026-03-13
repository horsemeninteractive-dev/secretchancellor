import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface GeminiSpeechOptions {
  text: string;
  voice: string;
}

export const generateGeminiSpeech = async (options: GeminiSpeechOptions): Promise<HTMLAudioElement | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: options.text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: options.voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
      return audio;
    }
    return null;
  } catch (error) {
    console.error("Gemini TTS error:", error);
    return null;
  }
};

export const getGeminiVoiceForAi = (aiName: string): string => {
  const voices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
  let hash = 0;
  for (let i = 0; i < aiName.length; i++) {
    hash = aiName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return voices[Math.abs(hash) % voices.length];
};
