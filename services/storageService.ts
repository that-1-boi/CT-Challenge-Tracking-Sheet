import { AppState, HistoryEntry, Theme } from '../types';
import { STORAGE_KEY, HISTORY_KEY, DEFAULT_CLASSES } from '../constants';

const DEFAULT_THEMES: Theme[] = [
  { 
    name: 'Robotics Workshop', 
    challenges: ['Build Base', 'Wire Sensors', 'Simple Path', 'Avoid Walls', 'Remote Control'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  },
  { 
    name: 'Advanced Sensors', 
    challenges: ['Line Follow', 'Color Match', 'Distance Stop', 'Maze Solver', 'Speed Test'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  },
  { 
    name: 'Coding Fundamentals', 
    challenges: ['Loops 101', 'If Statements', 'Variables', 'Function Fun', 'Debug Master'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  },
  { 
    name: 'Game Design', 
    challenges: ['Character Move', 'Collision', 'Score System', 'Level 2', 'Boss Fight'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  }
];

export const saveState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const loadState = (): AppState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    
    // Migration: Move global classes into themes if they exist
    if (parsed.classes && parsed.themes) {
      parsed.themes = parsed.themes.map((t: Theme) => ({
        ...t,
        classes: t.classes || JSON.parse(JSON.stringify(parsed.classes))
      }));
      delete parsed.classes;
    }

    if (!parsed.themes) {
      parsed.themes = DEFAULT_THEMES;
    } else {
      // Ensure all DEFAULT_CLASSES exist in every theme
      parsed.themes = parsed.themes.map((theme: Theme) => {
        const themeClassIds = new Set(theme.classes.map(c => c.id));
        const missingClasses = DEFAULT_CLASSES.filter(dc => !themeClassIds.has(dc.id));
        if (missingClasses.length > 0) {
          return {
            ...theme,
            classes: [...theme.classes, ...JSON.parse(JSON.stringify(missingClasses))]
          };
        }
        return theme;
      });
    }

    // Initialize public display fields if missing
    if (!parsed.publicThemeName) parsed.publicThemeName = parsed.currentWeekTheme || DEFAULT_THEMES[0].name;
    if (!parsed.publicClassId) parsed.publicClassId = parsed.selectedClassId || DEFAULT_CLASSES[0].id;
    
    return parsed;
  }
  return {
    themes: DEFAULT_THEMES,
    currentWeekTheme: DEFAULT_THEMES[0].name,
    publicThemeName: DEFAULT_THEMES[0].name,
    publicClassId: DEFAULT_CLASSES[0].id,
    progress: {},
    selectedClassId: DEFAULT_CLASSES[0].id,
  };
};

export const saveHistory = (history: HistoryEntry[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};

export const loadHistory = (): HistoryEntry[] => {
  const saved = localStorage.getItem(HISTORY_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  return [];
};