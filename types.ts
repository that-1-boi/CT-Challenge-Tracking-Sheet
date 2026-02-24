
export type ThemeCategory = 'mechanical' | 'programming';

export interface Theme {
  name: string;
  challenges: string[]; // List of 5 challenge names associated with this theme
  classes: ClassSession[]; // Rosters are now scoped specifically to each theme
  category?: ThemeCategory; // Theme category: mechanical or programming
}

export interface StudentProgress {
  studentId: string;
  studentName: string;
  challengesCompleted: string[]; // IDs of challenges (c1, c2, c3, c4, c5)
  timestamp: number;
}

export interface ClassSession {
  id: string; // e.g., "sat-am1"
  name: string; // e.g., "Sat AM1"
  students: Student[];
}

export interface Student {
  id: string;
  name: string;
}

export interface AppState {
  themes: Theme[]; // Library of themes with their challenge names and student rosters
  currentWeekTheme: string; // Currently active theme name for the Instructor Workspace
  publicThemeName: string; // Theme name currently displayed on the Public Display
  publicClassId: string;   // Class ID currently displayed on the Public Display
  progress: Record<string, StudentProgress>; // Key format: classId_studentId_themeName
  selectedClassId: string; // Currently selected class timeslot in Instructor Workspace
}

export interface HistoryEntry {
  id: string;
  studentName: string;
  className: string;
  weekName: string;
  weekTheme: string;
  challenges: string[]; // Names of completed challenges
  allAvailableChallenges: string[]; // Names of all 5 available challenges at time of archiving
  date: string;
  themeCreatedAt?: string; // Theme creation date for sorting by theme order
}

// =============================================================================
// BACKUP / RESTORE TYPES
// =============================================================================

export interface ProgressBackupTheme {
  name: string;
  category: string | null;
  challenges: { c1: string; c2: string; c3: string; c4: string; c5: string };
  students: Array<{
    studentId: string;
    studentName: string;
    classSessionId: string;
    c1: 0 | 1;
    c2: 0 | 1;
    c3: 0 | 1;
    c4: 0 | 1;
    c5: 0 | 1;
    lastUpdated: string;
  }>;
}

export interface ProgressBackupData {
  version: string;
  type: 'progress';
  exportedAt: string;
  metadata: { themeCount: number; studentCount: number; recordCount: number };
  themes: ProgressBackupTheme[];
}

export interface AttributesBackupData {
  version: string;
  type: 'attributes';
  exportedAt: string;
  metadata: { studentCount: number };
  students: Array<{
    studentId: string;
    studentName: string;
    competitiveness: number;
    independence: number;
    teamwork: number;
    performance: number;
    coachability: number;
    comments: string;
  }>;
}

// Student attributes for analytics radar chart (database-backed)
export interface StudentAttributes {
  id?: string;
  studentId: string;
  competitiveness: number;  // 0-100
  independence: number;     // 0-100
  teamwork: number;         // 0-100
  performance: number;      // 0-100
  coachability: number;     // 0-100
  comments: string;
  createdAt?: string;
  updatedAt?: string;
}
