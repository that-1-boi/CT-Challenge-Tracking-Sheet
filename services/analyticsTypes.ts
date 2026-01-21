/**
 * Student Performance Analytics - Type Definitions
 *
 * DATA MODEL ASSUMPTIONS:
 * 1. Each theme has exactly 5 challenges (c1-c5)
 * 2. Completion is binary per challenge (done or not done)
 * 3. Student completion % = (challenges completed / 5) * 100
 * 4. Each theme belongs to either 'mechanical' or 'programming' category
 * 5. Progress is tracked per student per theme per class session
 * 6. Historical data includes timestamps for growth analysis
 */

import { ThemeCategory } from '../types';

// ============================================================================
// RAW DATA STRUCTURES (Input)
// ============================================================================

export interface RawStudentThemeData {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  themeName: string;
  themeCategory: ThemeCategory | undefined;
  challengesCompleted: number; // 0-5
  totalChallenges: number; // Always 5
  completionPercent: number; // 0-100
  timestamp: number; // For chronological ordering
  date: string;
  themeCreatedAt: number; // Theme creation timestamp for ordering
}

// ============================================================================
// THEME-LEVEL STATISTICS
// ============================================================================

export interface ThemeStatistics {
  themeName: string;
  themeCategory: ThemeCategory | undefined;

  // Basic stats across ALL students in ALL classes
  totalStudents: number;
  meanCompletion: number; // 0-100
  standardDeviation: number;
  medianCompletion: number;
  minCompletion: number;
  maxCompletion: number;

  // Difficulty metrics
  difficultyWeight: number; // 1 - (meanCompletion / 100), higher = harder
  difficultyRank: number; // 1 = hardest theme
  difficultyLabel: 'Very Hard' | 'Hard' | 'Moderate' | 'Easy' | 'Very Easy';

  // Distribution buckets
  distribution: {
    bucket: string; // "0-20%", "21-40%", etc.
    count: number;
    percent: number;
  }[];
}

// ============================================================================
// STUDENT THEME SCORE (Per theme, per student)
// ============================================================================

export interface StudentThemeScore {
  themeName: string;
  themeCategory: ThemeCategory | undefined;

  // Raw data
  rawCompletion: number; // 0-100
  challengesCompleted: number;

  // Class statistics for this theme (for comparison)
  classMean: number; // Mean completion % for all students in this theme
  classMedian: number; // Median completion % for all students in this theme

  // Curved score calculation
  zScore: number; // (student - mean) / stddev, clamped to [-2, 2]
  curvedScore: number; // 50 + (zScore * 15), range ~20-80

  // Weighted score
  difficultyWeight: number;
  weightedScore: number; // curvedScore * difficultyWeight

  // Relative position
  percentileInTheme: number; // 0-100, position relative to all students in this theme

  // Theme ordering
  themeCreatedAt: number; // Theme creation timestamp for ordering
}

// ============================================================================
// STUDENT PROFILE (Aggregated per student)
// ============================================================================

export interface StudentProfile {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;

  // Theme-level scores
  themeScores: StudentThemeScore[];

  // Domain aggregation
  mechanicalScore: number; // Weighted average of mechanical theme scores
  programmingScore: number; // Weighted average of programming theme scores
  mechanicalThemeCount: number;
  programmingThemeCount: number;

  // Overall metrics
  overallScore: number; // Combined weighted average
  overallPercentile: number; // Position within class (0-100)

  // Classification
  strengthClassification: 'Mechanical' | 'Programming' | 'Balanced';
  strengthDelta: number; // |mechanical - programming|

  // Growth analysis
  growthSlope: number; // Linear regression slope of curved scores over time
  growthTrend: 'Improving' | 'Stable' | 'Declining';

  // Consistency analysis
  scoreStandardDeviation: number;
  consistencyScore: number; // 1 / (1 + stddev)
  consistencyLevel: 'High' | 'Moderate' | 'Low';

  // Session data
  totalSessions: number;
  totalChallengesCompleted: number;
  averageRawCompletion: number;
}

// ============================================================================
// CLASS-LEVEL SUMMARY
// ============================================================================

export interface ClassSummary {
  classId: string;
  className: string;

  // Student counts
  totalStudents: number;
  studentsWithData: number;

  // Domain performance
  averageMechanicalScore: number;
  averageProgrammingScore: number;
  domainStrength: 'Mechanical' | 'Programming' | 'Balanced';

  // Overall metrics
  averageOverallScore: number;
  medianOverallScore: number;
  scoreStandardDeviation: number;

  // Distribution of curved scores
  scoreDistribution: {
    bucket: string;
    count: number;
    percent: number;
  }[];

  // Growth trends
  studentsImproving: number;
  studentsStable: number;
  studentsDeclining: number;
  improvingPercent: number;
  decliningPercent: number;

  // Strength distribution
  mechanicalStrengthCount: number;
  programmingStrengthCount: number;
  balancedCount: number;

  // Top/bottom performers
  topPerformers: { studentName: string; score: number }[];
  needsAttention: { studentName: string; score: number }[];
}

// ============================================================================
// ANALYTICS RESULT (Complete output)
// ============================================================================

export interface AnalyticsResult {
  // Metadata
  generatedAt: string;
  totalStudents: number;
  totalThemes: number;
  totalSessions: number;

  // Theme-level data
  themeStatistics: ThemeStatistics[];
  themeDifficultyRanking: { themeName: string; difficultyWeight: number; meanCompletion: number }[];

  // Student-level data
  studentProfiles: StudentProfile[];

  // Class-level data
  classSummaries: ClassSummary[];

  // Global insights
  globalMechanicalAverage: number;
  globalProgrammingAverage: number;
  globalDomainStrength: 'Mechanical' | 'Programming' | 'Balanced';

  // Hardest/easiest themes
  hardestThemes: { name: string; meanCompletion: number; category?: ThemeCategory }[];
  easiestThemes: { name: string; meanCompletion: number; category?: ThemeCategory }[];
}
