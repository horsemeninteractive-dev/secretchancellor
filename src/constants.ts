import { CosmeticItem } from './types';

export const DEFAULT_ITEMS: CosmeticItem[] = [
  // Defaults
  { id: 'frame-default', name: 'Default Frame', price: 0, type: 'frame', description: 'Standard Issue' },
  { id: 'policy-default', name: 'Default Policy', price: 0, type: 'policy', description: 'Standard Issue' },
  { id: 'vote-default', name: 'Default Vote', price: 0, type: 'vote', description: 'Standard Issue' },
  { id: 'music-default', name: 'Default Music', price: 0, type: 'music', description: 'Standard Issue' },
  { id: 'sound-default', name: 'Default Sound', price: 0, type: 'sound', description: 'Standard Issue' },
  { id: 'background-default', name: 'Default Background', price: 0, type: 'background', description: 'Standard Issue' },

  // Frames
  { id: 'frame-red', name: 'Iron Vanguard', price: 500, type: 'frame', description: 'A standard State-faction border.' },
  { id: 'frame-gold', name: 'Golden Assembly', price: 1500, type: 'frame', description: 'For the most distinguished delegates.' },
  { id: 'frame-blue', name: 'Civil Guard', price: 500, type: 'frame', description: 'A standard Civil-faction border.' },
  { id: 'frame-rainbow', name: 'Spectrum Delegate', price: 3000, type: 'frame', description: 'A vibrant, shifting spectrum of colors.' },
  { id: 'frame-neon', name: 'Neon Resistance', price: 2000, type: 'frame', description: 'Glows with the energy of the underground.' },
  { id: 'frame-shadow', name: 'Shadow Cabal', price: 1000, type: 'frame', description: 'A dark, brooding frame for the secretive.' },
  { id: 'frame-thorns', name: 'Crown of Thorns', price: 2500, type: 'frame', description: 'Intricate thorny vines wrapping around your avatar.' },
  { id: 'frame-cyber', name: 'Cybernetic Link', price: 3500, type: 'frame', description: 'High-tech circuitry and glowing data streams.' },
  { id: 'frame-inferno', name: 'Eternal Inferno', price: 4000, type: 'frame', description: 'Animated flames licking the edges of your profile.' },
  { id: 'frame-glitch', name: 'System Glitch', price: 3000, type: 'frame', description: 'Digital artifacts and chromatic aberration.' },
  { id: 'frame-royal', name: 'Royal Crest', price: 5000, type: 'frame', description: 'Ornate silver and sapphire decorations.' },

  // Policy Cards
  { id: 'policy-vintage', name: 'Vintage Press', price: 1200, type: 'policy', description: 'A classic, weathered newspaper aesthetic.' },
  { id: 'policy-modern', name: 'Modern Minimal', price: 1000, type: 'policy', description: 'Clean lines and bold typography.' },
  { id: 'policy-blueprint', name: 'State Blueprint', price: 1500, type: 'policy', description: 'Technical drawings on blueprint paper.' },
  { id: 'policy-blood', name: 'Blood & Iron', price: 2000, type: 'policy', description: 'Industrial metal with crimson accents.' },
  { id: 'policy-gold', name: 'Golden Decree', price: 3500, type: 'policy', description: 'Ornate gold-leafed policy cards for the elite.' },
  { id: 'policy-neon', name: 'Neon Directive', price: 5000, type: 'policy', description: 'Holographic interface with glowing data streams.' },
  { id: 'policy-animated', name: 'The Living Charter', price: 10000, type: 'policy', description: 'LEGENDARY: Shifting ink and glowing runes that pulse with power.' },

  // Voting Cards
  { id: 'vote-classic', name: 'Classic Ballot', price: 800, type: 'vote', description: 'Traditional paper ballots.' },
  { id: 'vote-wax', name: 'Wax Seal', price: 1800, type: 'vote', description: 'Official documents sealed with red wax.' },
  { id: 'vote-digital', name: 'Digital Consensus', price: 1500, type: 'vote', description: 'Holographic voting interface.' },
  { id: 'vote-ancient', name: 'Ancient Ostracon', price: 2500, type: 'vote', description: 'Pottery shards used in ancient democracy.' },
  { id: 'vote-neon', name: 'Neon Pulse', price: 5000, type: 'vote', description: 'LEGENDARY: A high-energy holographic vote that pulses with neon light.' },
  { id: 'vote-royal', name: 'Royal Decree', price: 3500, type: 'vote', description: 'EPIC: An ornate, gold-trimmed ballot for the ruling class.' },
  { id: 'vote-cyber', name: 'Cyber Protocol', price: 2000, type: 'vote', description: 'RARE: A sleek, data-driven interface for the modern age.' },

  // Music
  { id: 'music-fog', name: 'Fog In The Alley', price: 1500, type: 'music', description: 'Mysterious and low-profile noir vibes.' },
  { id: 'music-tense', name: 'Final Countdown', price: 2500, type: 'music', description: 'High-stakes rhythmic tension for the endgame.' },
  { id: 'music-victory', name: 'Triumph of the New Age', price: 4000, type: 'music', description: 'A grand orchestral anthem for the victors.' },

  // Sound Packs
  { id: 'sound-retro', name: 'Retro 8-bit', price: 1500, type: 'sound', description: 'Classic arcade sound effects.' },
  { id: 'sound-industrial', name: 'Industrial Clang', price: 2500, type: 'sound', description: 'Heavy, metallic sound effects.' },
  
  // Backgrounds
  { id: 'bg-leather', name: 'Dark Leather', price: 1000, type: 'background', description: 'A sophisticated dark leather texture.', imageUrl: 'https://www.transparenttextures.com/patterns/dark-leather.png' },
  { id: 'bg-brushed', name: 'Brushed Metal', price: 1500, type: 'background', description: 'Cold, industrial brushed aluminum.', imageUrl: 'https://www.transparenttextures.com/patterns/brushed-alum.png' },
  { id: 'bg-diamonds', name: 'Diamond Plate', price: 1200, type: 'background', description: 'Reinforced steel diamond pattern.', imageUrl: 'https://www.transparenttextures.com/patterns/diagmonds-light.png' },
  { id: 'bg-wood', name: 'Dark Mahogany', price: 2000, type: 'background', description: 'Rich, polished dark wood grain.', imageUrl: 'https://www.transparenttextures.com/patterns/dark-wood.png' },
  { id: 'bg-paper', name: 'Aged Parchment', price: 1800, type: 'background', description: 'Weathered, historical paper texture.', imageUrl: 'https://www.transparenttextures.com/patterns/old-mathematics.png' },
  { id: 'bg-concrete', name: 'Urban Concrete', price: 1400, type: 'background', description: 'Rough, brutalist concrete wall.', imageUrl: 'https://www.transparenttextures.com/patterns/concrete-wall.png' },
  
  // Assembly Pass Rewards (Free Tier)
  { id: 'bg-pass-0', name: 'Season 0: Geometric Grid', price: 0, type: 'background', description: 'Exclusive Season 0 background.', imageUrl: 'https://www.transparenttextures.com/patterns/gplay.png' },
  { id: 'vote-pass-0', name: 'Season 0: Purple Rain', price: 0, type: 'vote', description: 'Exclusive Season 0 animated voting card.', imageUrl: 'https://www.transparenttextures.com/patterns/diagonal-striped-brick.png' },
  { id: 'music-pass-0', name: 'Season 0: Static Noise', price: 0, type: 'music', description: 'Exclusive Season 0 music track.', imageUrl: 'https://www.transparenttextures.com/patterns/noise-lines-small.png' },
  { id: 'frame-pass-0', name: 'Season 0: Purple Pill', price: 0, type: 'frame', description: 'Exclusive Season 0 animated avatar frame.', imageUrl: 'https://www.transparenttextures.com/patterns/circles-light.png' },
];

export const PASS_ITEM_LEVELS: { [key: string]: number } = {
  'bg-pass-0': 10,
  'vote-pass-0': 20,
  'music-pass-0': 40,
  'frame-pass-0': 50,
};
