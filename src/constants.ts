import { CosmeticItem } from './types';

export const DEFAULT_ITEMS: CosmeticItem[] = [
  { id: 'frame-default', name: 'Default Frame', price: 0, type: 'frame', description: 'Standard Issue' },
  { id: 'policy-default', name: 'Default Policy', price: 0, type: 'policy', description: 'Standard Issue' },
  { id: 'vote-default', name: 'Default Vote', price: 0, type: 'vote', description: 'Standard Issue' },
  { id: 'music-default', name: 'Default Music', price: 0, type: 'music', description: 'Standard Issue' },
  { id: 'sound-default', name: 'Default Sound', price: 0, type: 'sound', description: 'Standard Issue' },
  { id: 'background-default', name: 'Default Background', price: 0, type: 'background', description: 'Standard Issue' },
];

export const PASS_ITEM_LEVELS: { [key: string]: number } = {
  'bg-pass-0': 10,
  'vote-pass-0': 20,
  'music-pass-0': 40,
  'frame-pass-0': 50,
};
