
let voices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

export interface VoiceProfile {
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

const aiProfileMap = new Map<string, VoiceProfile>();

export const initVoices = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  
  const loadVoices = () => {
    const newVoices = window.speechSynthesis.getVoices();
    if (newVoices.length > 0) {
      voices = newVoices;
      voicesLoaded = true;
      // Clear cache if we just got voices for the first time or more voices
      if (aiProfileMap.size > 0 && voices.length > 1) {
        // We don't necessarily want to clear everything as it might change voices mid-game,
        // but if they were all assigned to the same default voice, it's worth it.
        const firstVoiceName = Array.from(aiProfileMap.values())[0]?.voice.name;
        const allSame = Array.from(aiProfileMap.values()).every(p => p.voice.name === firstVoiceName);
        if (allSame && voices.length > 1) {
          aiProfileMap.clear();
        }
      }
    }
  };
  
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  
  // Chrome on Android/Mobile sometimes needs a few tries
  for (let i = 1; i <= 5; i++) {
    setTimeout(loadVoices, i * 500);
  }
};

export const getVoiceProfileForAi = (aiName: string): VoiceProfile | undefined => {
  if (aiProfileMap.has(aiName)) return aiProfileMap.get(aiName);
  
  // Try one last time to get voices if empty
  if (voices.length === 0 && typeof window !== 'undefined' && window.speechSynthesis) {
    voices = window.speechSynthesis.getVoices();
  }
  
  if (voices.length === 0) return undefined;
  
  // Filter for English voices or current locale
  const lang = navigator.language || 'en-US';
  const langPrefix = lang.split('-')[0];
  let preferredVoices = voices.filter(v => v.lang.startsWith(langPrefix));
  
  // If no language match, try to find any English voice
  if (preferredVoices.length === 0) {
    preferredVoices = voices.filter(v => v.lang.startsWith('en'));
  }
  
  if (preferredVoices.length === 0) preferredVoices = voices;

  // Use a simple hash of the name to pick a voice and variations
  let hash = 0;
  for (let i = 0; i < aiName.length; i++) {
    hash = aiName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Try to pick a voice not already used by another AI
  const usedVoiceNames = Array.from(aiProfileMap.values()).map(p => p.voice.name);
  let availableVoices = preferredVoices.filter(v => !usedVoiceNames.includes(v.name));
  
  // If all preferred voices are used, just use the preferred list
  if (availableVoices.length === 0) availableVoices = preferredVoices;

  const voice = availableVoices[Math.abs(hash) % availableVoices.length];
  
  // Stable variations based on hash to make the voice sound unique
  // If we have very few voices, we should be more aggressive with pitch/rate
  const isLimitedVoices = voices.length < 3;
  
  // Pitch: 0.5 (deep) to 1.5 (high) - wider range for limited voices
  const pitchRange = isLimitedVoices ? 1.0 : 0.5;
  const pitchBase = isLimitedVoices ? 0.5 : 0.8;
  const pitch = pitchBase + (Math.abs(hash % 100) / 100) * pitchRange; 
  
  // Rate: 0.8 (slow) to 1.4 (fast)
  const rateRange = isLimitedVoices ? 0.6 : 0.3;
  const rateBase = isLimitedVoices ? 0.8 : 0.9;
  const rate = rateBase + (Math.abs((hash >> 2) % 100) / 100) * rateRange;

  const profile: VoiceProfile = { voice, pitch, rate };
  aiProfileMap.set(aiName, profile);
  return profile;
};

export const speakAiMessage = (
  text: string, 
  aiName: string, 
  profile: VoiceProfile,
  onStart: () => void,
  onEnd: () => void
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = profile.voice;
  utterance.pitch = profile.pitch;
  utterance.rate = profile.rate;
  
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = (e) => {
    console.error('Speech error:', e);
    onEnd();
  };
  
  window.speechSynthesis.speak(utterance);
};
