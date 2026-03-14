const BASE_XP = Math.floor(1000 / 6);

export const getLevelFromXp = (xp: number): number => {
  let level = 1;
  let xpNeeded = BASE_XP;
  let totalXpNeeded = 0;
  while (xp >= totalXpNeeded + xpNeeded) {
    totalXpNeeded += xpNeeded;
    level++;
    xpNeeded = Math.floor(BASE_XP * Math.pow(1.5, level - 1));
  }
  return level;
};

export const getXpForNextLevel = (level: number): number => {
  return Math.floor(BASE_XP * Math.pow(1.5, level - 1));
};

export const getXpInCurrentLevel = (xp: number): number => {
  let level = 1;
  let xpNeeded = BASE_XP;
  let totalXpNeeded = 0;
  while (xp >= totalXpNeeded + xpNeeded) {
    totalXpNeeded += xpNeeded;
    level++;
    xpNeeded = Math.floor(BASE_XP * Math.pow(1.5, level - 1));
  }
  return xp - totalXpNeeded;
};

export const calculateXpGain = (stats: {
  win: boolean;
  kills: number;
}): number => {
  let xp = 50; // Base for playing
  if (stats.win) xp += 100;
  xp += stats.kills * 50;
  return xp;
};
