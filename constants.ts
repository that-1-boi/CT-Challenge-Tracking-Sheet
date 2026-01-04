import { ClassSession, Theme } from './types';

export const DEFAULT_CLASSES: ClassSession[] = [
  { id: 'sat-am1', name: 'Sat AM1', students: [] },
  { id: 'sun-am1', name: 'Sun AM1', students: [] },
  { id: 'sun-am2', name: 'Sun AM2', students: [] },
  { id: 'sun-pm1', name: 'Sun PM1', students: [] },
  { id: 'sun-pm2', name: 'Sun PM2', students: [] },
  { id: 'unassigned', name: 'Unassigned', students: [] },
];

export const DEFAULT_THEMES: Theme[] = [
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

export const STORAGE_KEY = 'classroom_tracker_state_v2';
export const HISTORY_KEY = 'classroom_tracker_history_v2';