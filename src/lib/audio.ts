// All sound effects are sourced from Kenney's Sound Pack (CC0 / Public Domain)
// https://kenney.nl  |  Hosted at https://gamesounds.xyz
//
// NOTE: gamesounds.xyz serves .ogg files.
// OGG is natively supported in Chrome, Firefox and Edge.
// Safari does not support OGG — sounds will silently fail on Safari/iOS.
// If full Safari support is needed, host MP3 equivalents on GCS and swap the URLs.

const BASE = "https://gamesounds.xyz/Kenney%27s%20Sound%20Pack";

export const MUSIC_TRACKS: Record<string, string> = {
  'music-ambient': 'https://storage.googleapis.com/secretchancellor/Shadows%20Over%20Parliament.mp3',
  'music-fog':     'https://storage.googleapis.com/secretchancellor/Fog%20in%20the%20Alley.mp3',
  'music-tense':   'https://storage.googleapis.com/secretchancellor/Final%20Countdown.mp3',
  'music-victory': 'https://storage.googleapis.com/secretchancellor/Triumph%20of%20the%20New%20Age.mp3',
};

export const SOUND_PACKS: Record<string, Record<string, string>> = {

  // ─── Default ──────────────────────────────────────────────────────────────
  // Clean, cinematic UI sounds — Kenney Interface Sounds & RPG Audio
  'default': {
    // Crisp UI click for every button press
    'click':           `${BASE}/Interface%20Sounds/click_001.ogg`,
    // Sharp blade — thematically fits the assassination executive action
    'death':           `${BASE}/RPG%20Audio/knifeSlice.ogg`,
    // Rising confirmation tone — government elected
    'election_passed': `${BASE}/Interface%20Sounds/confirmation_001.ogg`,
    // Clear error / rejection sting — election failed
    'election_failed': `${BASE}/Interface%20Sounds/error_001.ogg`,
    // Longest, most triumphant confirmation — game won
    'victory':         `${BASE}/Interface%20Sounds/confirmation_004.ogg`,
    // Heavy closing sound — the weight of a loss
    'defeat':          `${BASE}/Interface%20Sounds/close_004.ogg`,
    // Team-specific win sounds
    'win_civil':       'https://storage.googleapis.com/secretchancellor/CivilWin.mp3',
    'win_state':       'https://storage.googleapis.com/secretchancellor/StateWin.mp3',
  },

  // ─── Retro ────────────────────────────────────────────────────────────────
  // 8-bit / arcade sounds — Kenney Retro Sounds 1 & 2
  'sound-retro': {
    // Short retro laser pew — snappy arcade click
    'click':           `${BASE}/Retro%20Sounds%201/laser1.ogg`,
    // Retro hit effect — enemy eliminated
    'death':           `${BASE}/Retro%20Sounds%202/hit1.ogg`,
    // Classic coin collect — government approved, reward earned
    'election_passed': `${BASE}/Retro%20Sounds%202/coin1.ogg`,
    // Retro descending lose jingle — vote failed
    'election_failed': `${BASE}/Retro%20Sounds%201/lose1.ogg`,
    // Retro power-up / item pickup — you won!
    'victory':         `${BASE}/Retro%20Sounds%201/pickup3.ogg`,
    // Classic retro game-over fanfare — defeat
    'defeat':          `${BASE}/Retro%20Sounds%202/gameover1.ogg`,
    // Team-specific win sounds
    'win_civil':       `${BASE}/Retro%20Sounds%201/pickup3.ogg`,
    'win_state':       `${BASE}/Retro%20Sounds%201/pickup2.ogg`,
  },

  // ─── Industrial ───────────────────────────────────────────────────────────
  // Heavy mechanical impacts — Kenney Impact Sounds & Interface Sounds
  'sound-industrial': {
    // Hard dry tap — like a gavel stamp on a desk
    'click':           `${BASE}/Impact%20Sounds/impactGeneric_light_000.ogg`,
    // Deep resonant bell toll — a death knell
    'death':           `${BASE}/Impact%20Sounds/impactBell_heavy_000.ogg`,
    // Bright glass chime — approval granted
    'election_passed': `${BASE}/Impact%20Sounds/impactGlass_light_000.ogg`,
    // Heavy glass smash — motion violently rejected
    'election_failed': `${BASE}/Impact%20Sounds/impactGlass_heavy_000.ogg`,
    // Rising industrial sweep — triumphant machinery
    'victory':         `${BASE}/Interface%20Sounds/maximize_001.ogg`,
    // Lowest, heaviest bell — the final toll of defeat
    'defeat':          `${BASE}/Impact%20Sounds/impactBell_heavy_004.ogg`,
    // Team-specific win sounds
    'win_civil':       `${BASE}/Interface%20Sounds/maximize_001.ogg`,
    'win_state':       `${BASE}/Interface%20Sounds/maximize_002.ogg`,
  },

};