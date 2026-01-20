import { ClassSession } from './types';

export const DEFAULT_CLASSES: ClassSession[] = [
  { id: 'sat-am1', name: 'Sat AM1', students: [] },
  { id: 'sun-am1', name: 'Sun AM1', students: [] },
  { id: 'sun-am2', name: 'Sun AM2', students: [] },
  { id: 'sun-pm1', name: 'Sun PM1', students: [] },
  { id: 'sun-pm2', name: 'Sun PM2', students: [] },
  { id: 'unassigned', name: 'Unassigned', students: [] },
];

export const STORAGE_KEY = 'classroom_tracker_state_v2';
export const HISTORY_KEY = 'classroom_tracker_history_v2';