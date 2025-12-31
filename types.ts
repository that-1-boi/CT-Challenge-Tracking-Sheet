
export interface Theme {
  name: string;
  challenges: string[]; // List of 5 challenge names associated with this theme
  challengeImages?: string[]; // Optional list of 5 base64 image strings for each challenge
  classes: ClassSession[]; // Rosters are now scoped specifically to each theme
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
}
