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
    name: 'Pneumatic Configs & Basic Claw',
    challenges: ['4 Cylinder Configuration', 'Programming', 'Basic Claw', 'Pin Pickup', 'Beam Pickup'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  },
  {
    name: 'Autonnomous Basics',
    challenges: ['Right Square', 'Left Square', '4 Square Butterfly', 'Triangle', 'Hexagon'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  },
  {
    name: 'Momentun Turn',
    challenges: ['Right Square', 'Left Square', '4 Square Butterfly', 'Triangle', 'Hexagon'],
    classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES))
  }
];

export const STORAGE_KEY = 'classroom_tracker_state_v2';
export const HISTORY_KEY = 'classroom_tracker_history_v2';