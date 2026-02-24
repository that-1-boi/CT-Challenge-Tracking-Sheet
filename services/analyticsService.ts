/**
 * Student Performance Analytics - Calculation Service
 *
 * This service implements the difficulty-aware scoring algorithm:
 * 1. Theme Normalization (Curve): Z-score based curved scoring
 * 2. Difficulty Weighting: Harder themes contribute more
 * 3. Domain Aggregation: Separate mechanical vs programming scores
 * 4. Growth & Consistency: Track improvement over time
 */

import { supabase } from './supabaseClient';
import { ThemeCategory } from '../types';
import {
  RawStudentThemeData,
  ThemeStatistics,
  StudentThemeScore,
  StudentProfile,
  ClassSummary,
  AnalyticsResult,
  StudentAttributesSummary,
} from './analyticsTypes';
import { loadAllStudentAttributes, StudentAttributesRow } from './supabaseService';

// ============================================================================
// DAILY CACHE FOR ANALYTICS (reduces egress by caching results for 24 hours)
// ============================================================================

const ANALYTICS_CACHE_KEY = 'analytics_cache';
const ANALYTICS_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Serializable cache format (Map converted to array entries)
interface AnalyticsCacheData {
  generatedAt: string;
  totalStudents: number;
  totalThemes: number;
  totalSessions: number;
  themeStatistics: ThemeStatistics[];
  themeDifficultyRanking: { themeName: string; difficultyWeight: number; meanCompletion: number }[];
  studentProfiles: StudentProfile[];
  classSummaries: ClassSummary[];
  globalMechanicalAverage: number;
  globalProgrammingAverage: number;
  globalDomainStrength: 'Mechanical' | 'Programming' | 'Balanced';
  hardestThemes: { name: string; meanCompletion: number; category?: ThemeCategory }[];
  easiestThemes: { name: string; meanCompletion: number; category?: ThemeCategory }[];
  studentAttributesMapEntries: [string, StudentAttributesSummary][]; // Map converted to entries
}

interface AnalyticsCache {
  data: AnalyticsCacheData;
  timestamp: number;
}

function getCachedAnalytics(): AnalyticsResult | null {
  try {
    const cached = localStorage.getItem(ANALYTICS_CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp }: AnalyticsCache = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age < ANALYTICS_CACHE_DURATION_MS) {
      console.log(`📊 Using cached analytics (${Math.round(age / 1000 / 60)} minutes old)`);
      // Reconstruct Map from entries
      const { studentAttributesMapEntries, ...rest } = data;
      return {
        ...rest,
        studentAttributesMap: new Map(studentAttributesMapEntries),
      };
    }

    console.log('📊 Analytics cache expired, will refresh');
    return null;
  } catch (error) {
    console.error('Error reading analytics cache:', error);
    return null;
  }
}

function setCachedAnalytics(data: AnalyticsResult): void {
  try {
    // Convert Map to entries array for JSON serialization
    const { studentAttributesMap, ...rest } = data;
    const cacheData: AnalyticsCacheData = {
      ...rest,
      studentAttributesMapEntries: Array.from(studentAttributesMap.entries()),
    };
    const cache: AnalyticsCache = {
      data: cacheData,
      timestamp: Date.now()
    };
    localStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify(cache));
    console.log('📊 Analytics cached for 24 hours');
  } catch (error) {
    console.error('Error caching analytics:', error);
  }
}

export function clearAnalyticsCache(): void {
  localStorage.removeItem(ANALYTICS_CACHE_KEY);
  console.log('📊 Analytics cache cleared');
}

// ============================================================================
// STATISTICAL HELPER FUNCTIONS
// ============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squaredDiffs));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  return (below / sorted.length) * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Simple linear regression to find slope
 * Returns the slope of the best-fit line
 */
function linearRegressionSlope(xValues: number[], yValues: number[]): number {
  if (xValues.length < 2) return 0;

  const n = xValues.length;
  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

function getDifficultyLabel(meanCompletion: number): 'Very Hard' | 'Hard' | 'Moderate' | 'Easy' | 'Very Easy' {
  if (meanCompletion < 30) return 'Very Hard';
  if (meanCompletion < 50) return 'Hard';
  if (meanCompletion < 70) return 'Moderate';
  if (meanCompletion < 85) return 'Easy';
  return 'Very Easy';
}

function getDistributionBuckets(values: number[]): { bucket: string; count: number; percent: number }[] {
  const buckets = [
    { bucket: '0%', min: 0, max: 0, count: 0 },
    { bucket: '1-20%', min: 1, max: 20, count: 0 },
    { bucket: '21-40%', min: 21, max: 40, count: 0 },
    { bucket: '41-60%', min: 41, max: 60, count: 0 },
    { bucket: '61-80%', min: 61, max: 80, count: 0 },
    { bucket: '81-100%', min: 81, max: 100, count: 0 },
  ];

  values.forEach(v => {
    for (const bucket of buckets) {
      if (v >= bucket.min && v <= bucket.max) {
        bucket.count++;
        break;
      }
    }
  });

  const total = values.length || 1;
  return buckets.map(b => ({
    bucket: b.bucket,
    count: b.count,
    percent: (b.count / total) * 100,
  }));
}

// ============================================================================
// STUDENT ATTRIBUTE WEIGHTS (for competition readiness)
// ============================================================================

const ATTRIBUTE_WEIGHTS = {
  coachability: 0.30,      // 30%
  competitiveness: 0.25,   // 25%
  teamwork: 0.18,          // 18%
  independence: 0.18,      // 18%
  performance: 0.09,       // 9%
} as const;

const DEFAULT_ATTRIBUTE_VALUE = 50; // Default for students without saved attributes

/**
 * Calculate weighted attribute score (0-100)
 */
function calculateWeightedAttributeScore(attrs: {
  coachability: number;
  competitiveness: number;
  teamwork: number;
  independence: number;
  performance: number;
}): number {
  return (
    attrs.coachability * ATTRIBUTE_WEIGHTS.coachability +
    attrs.competitiveness * ATTRIBUTE_WEIGHTS.competitiveness +
    attrs.teamwork * ATTRIBUTE_WEIGHTS.teamwork +
    attrs.independence * ATTRIBUTE_WEIGHTS.independence +
    attrs.performance * ATTRIBUTE_WEIGHTS.performance
  );
}

/**
 * Build student attributes summary map from raw database data
 */
function buildStudentAttributesMap(
  studentProfiles: StudentProfile[],
  attributesData: Map<string, StudentAttributesRow>
): Map<string, StudentAttributesSummary> {
  const studentAttributesMap = new Map<string, StudentAttributesSummary>();

  for (const profile of studentProfiles) {
    const attrs = attributesData.get(profile.studentId);

    if (attrs) {
      const weightedScore = calculateWeightedAttributeScore({
        coachability: attrs.coachability,
        competitiveness: attrs.competitiveness,
        teamwork: attrs.teamwork,
        independence: attrs.independence,
        performance: attrs.performance,
      });

      studentAttributesMap.set(profile.studentId, {
        coachability: attrs.coachability,
        competitiveness: attrs.competitiveness,
        teamwork: attrs.teamwork,
        independence: attrs.independence,
        performance: attrs.performance,
        weightedAttributeScore: weightedScore,
        hasAttributes: true,
      });
    } else {
      // Default values for students without saved attributes
      studentAttributesMap.set(profile.studentId, {
        coachability: DEFAULT_ATTRIBUTE_VALUE,
        competitiveness: DEFAULT_ATTRIBUTE_VALUE,
        teamwork: DEFAULT_ATTRIBUTE_VALUE,
        independence: DEFAULT_ATTRIBUTE_VALUE,
        performance: DEFAULT_ATTRIBUTE_VALUE,
        weightedAttributeScore: DEFAULT_ATTRIBUTE_VALUE,
        hasAttributes: false,
      });
    }
  }

  return studentAttributesMap;
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadRawAnalyticsData(): Promise<RawStudentThemeData[]> {
  // Load all progress data with theme and student info (select only needed columns to reduce egress)
  // Limit to 5000 rows to prevent excessive egress while allowing comprehensive analytics
  const { data: rosterData, error: rosterError } = await supabase
    .from('v_student_roster')
    .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated')
    .order('last_updated', { ascending: true })
    .limit(5000);

  if (rosterError) {
    console.error('Error loading roster data:', rosterError);
    return [];
  }

  // Load theme categories and creation dates
  const { data: themesData, error: themesError } = await supabase
    .from('themes')
    .select('name, category, created_at');

  if (themesError) {
    console.error('Error loading themes:', themesError);
    return [];
  }

  const themeCategoryMap = new Map<string, ThemeCategory | undefined>(
    themesData?.map(t => [t.name, t.category as ThemeCategory | undefined]) || []
  );

  const themeCreatedAtMap = new Map<string, number>(
    themesData?.map(t => [t.name, t.created_at ? new Date(t.created_at).getTime() : 0]) || []
  );

  // Transform roster data into raw analytics data
  // IMPORTANT: Only include students with actual progress data (last_updated not null)
  // This filters out students who are assigned to themes but never participated
  const rawData: RawStudentThemeData[] = [];

  for (const row of rosterData || []) {
    // Skip entries without actual progress data
    // If last_updated is null, the student was assigned but never had any progress recorded
    if (!row.last_updated) {
      continue;
    }

    const challengesCompleted =
      (row.c1 ? 1 : 0) +
      (row.c2 ? 1 : 0) +
      (row.c3 ? 1 : 0) +
      (row.c4 ? 1 : 0) +
      (row.c5 ? 1 : 0);

    rawData.push({
      studentId: row.student_id,
      studentName: row.student_name,
      classId: row.class_session_id,
      className: row.class_session_name,
      themeName: row.theme_name,
      themeCategory: themeCategoryMap.get(row.theme_name),
      challengesCompleted,
      totalChallenges: 5,
      completionPercent: (challengesCompleted / 5) * 100,
      timestamp: new Date(row.last_updated).getTime(),
      date: row.last_updated,
      themeCreatedAt: themeCreatedAtMap.get(row.theme_name) || 0,
    });
  }

  return rawData;
}

// ============================================================================
// THEME STATISTICS CALCULATION
// ============================================================================

function calculateThemeStatistics(
  rawData: RawStudentThemeData[]
): ThemeStatistics[] {
  // Group data by theme
  const themeGroups = new Map<string, RawStudentThemeData[]>();

  for (const entry of rawData) {
    if (!themeGroups.has(entry.themeName)) {
      themeGroups.set(entry.themeName, []);
    }
    themeGroups.get(entry.themeName)!.push(entry);
  }

  // Calculate statistics for each theme
  const themeStats: ThemeStatistics[] = [];

  for (const [themeName, entries] of themeGroups) {
    const completions = entries.map(e => e.completionPercent);
    const meanComp = mean(completions);
    const stdDev = standardDeviation(completions);

    themeStats.push({
      themeName,
      themeCategory: entries[0]?.themeCategory,
      totalStudents: entries.length,
      meanCompletion: meanComp,
      standardDeviation: stdDev,
      medianCompletion: median(completions),
      minCompletion: Math.min(...completions),
      maxCompletion: Math.max(...completions),
      difficultyWeight: 1 - meanComp / 100, // Higher weight for harder themes
      difficultyRank: 0, // Will be set after sorting
      difficultyLabel: getDifficultyLabel(meanComp),
      distribution: getDistributionBuckets(completions),
    });
  }

  // Sort by difficulty (lowest mean = hardest = rank 1)
  themeStats.sort((a, b) => a.meanCompletion - b.meanCompletion);
  themeStats.forEach((t, i) => (t.difficultyRank = i + 1));

  return themeStats;
}

// ============================================================================
// STUDENT THEME SCORE CALCULATION (CURVED SCORING)
// ============================================================================

function calculateStudentThemeScore(
  studentEntry: RawStudentThemeData,
  themeStats: ThemeStatistics,
  allCompletionsInTheme: number[]
): StudentThemeScore {
  const { completionPercent, challengesCompleted, themeName, themeCategory, themeCreatedAt } = studentEntry;
  const { meanCompletion, medianCompletion, standardDeviation: stdDev, difficultyWeight } = themeStats;

  // Z-score calculation
  // If stdDev is 0 (everyone has same score), z-score is 0
  let zScore = 0;
  if (stdDev > 0) {
    zScore = (completionPercent - meanCompletion) / stdDev;
  }

  // Clamp z-score to [-2, 2] to prevent extreme outliers
  zScore = clamp(zScore, -2, 2);

  // Curved score: 50 + (z-score * 15)
  // This gives a range of roughly 20-80 for z-scores in [-2, 2]
  const curvedScore = 50 + zScore * 15;

  // Weighted score (harder themes contribute more)
  const weightedScore = curvedScore * difficultyWeight;

  // Percentile within this theme
  const percentileInTheme = percentile(completionPercent, allCompletionsInTheme);

  return {
    themeName,
    themeCategory,
    rawCompletion: completionPercent,
    challengesCompleted,
    classMean: meanCompletion,
    classMedian: medianCompletion,
    zScore,
    curvedScore,
    difficultyWeight,
    weightedScore,
    percentileInTheme,
    themeCreatedAt,
  };
}

// ============================================================================
// STUDENT PROFILE CALCULATION
// ============================================================================

function calculateStudentProfiles(
  rawData: RawStudentThemeData[],
  themeStats: ThemeStatistics[]
): StudentProfile[] {
  // Create theme stats lookup
  const themeStatsMap = new Map<string, ThemeStatistics>(
    themeStats.map(t => [t.themeName, t])
  );

  // Group completions by theme for percentile calculation
  const themeCompletions = new Map<string, number[]>();
  for (const entry of rawData) {
    if (!themeCompletions.has(entry.themeName)) {
      themeCompletions.set(entry.themeName, []);
    }
    themeCompletions.get(entry.themeName)!.push(entry.completionPercent);
  }

  // Group data by student
  const studentGroups = new Map<string, RawStudentThemeData[]>();
  for (const entry of rawData) {
    const key = entry.studentId;
    if (!studentGroups.has(key)) {
      studentGroups.set(key, []);
    }
    studentGroups.get(key)!.push(entry);
  }

  // Calculate profile for each student
  const profiles: StudentProfile[] = [];

  for (const [studentId, entries] of studentGroups) {
    // Sort entries chronologically
    const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const firstEntry = sortedEntries[0];

    // Calculate theme scores
    const themeScores: StudentThemeScore[] = [];
    for (const entry of sortedEntries) {
      const stats = themeStatsMap.get(entry.themeName);
      if (stats) {
        const score = calculateStudentThemeScore(
          entry,
          stats,
          themeCompletions.get(entry.themeName) || []
        );
        themeScores.push(score);
      }
    }

    // Sort theme scores by theme creation date (earliest first for chronological graph display)
    themeScores.sort((a, b) => a.themeCreatedAt - b.themeCreatedAt);

    // Separate by domain
    const mechanicalScores = themeScores.filter(s => s.themeCategory === 'mechanical');
    const programmingScores = themeScores.filter(s => s.themeCategory === 'programming');

    // Weighted average for each domain
    const calculateWeightedAverage = (scores: StudentThemeScore[]): number => {
      if (scores.length === 0) return 0;
      const totalWeight = scores.reduce((sum, s) => sum + s.difficultyWeight, 0);
      if (totalWeight === 0) return mean(scores.map(s => s.curvedScore));
      return scores.reduce((sum, s) => sum + s.weightedScore, 0) / totalWeight;
    };

    const mechanicalScore = calculateWeightedAverage(mechanicalScores);
    const programmingScore = calculateWeightedAverage(programmingScores);

    // Overall score (weighted average of all themes)
    const overallScore = calculateWeightedAverage(themeScores);

    // Strength classification
    const strengthDelta = Math.abs(mechanicalScore - programmingScore);
    let strengthClassification: 'Mechanical' | 'Programming' | 'Balanced' = 'Balanced';
    if (mechanicalScore - programmingScore > 3) {
      strengthClassification = 'Mechanical';
    } else if (programmingScore - mechanicalScore > 3) {
      strengthClassification = 'Programming';
    }

    // Growth analysis (linear regression of curved scores over time)
    const curvedScores = themeScores.map(s => s.curvedScore);
    const timeIndices = sortedEntries.map((_, i) => i); // Use index as time proxy
    const growthSlope = linearRegressionSlope(timeIndices, curvedScores);

    let growthTrend: 'Improving' | 'Stable' | 'Declining' = 'Stable';
    if (growthSlope > 1) {
      growthTrend = 'Improving';
    } else if (growthSlope < -1) {
      growthTrend = 'Declining';
    }

    // Consistency analysis
    const scoreStdDev = standardDeviation(curvedScores);
    const consistencyScore = 1 / (1 + scoreStdDev / 10); // Normalize stddev impact

    let consistencyLevel: 'High' | 'Moderate' | 'Low' = 'Moderate';
    if (consistencyScore > 0.7) {
      consistencyLevel = 'High';
    } else if (consistencyScore < 0.4) {
      consistencyLevel = 'Low';
    }

    // Session stats
    const totalChallengesCompleted = entries.reduce((sum, e) => sum + e.challengesCompleted, 0);
    const averageRawCompletion = mean(entries.map(e => e.completionPercent));

    profiles.push({
      studentId,
      studentName: firstEntry.studentName,
      classId: firstEntry.classId,
      className: firstEntry.className,
      themeScores,
      mechanicalScore,
      programmingScore,
      mechanicalThemeCount: mechanicalScores.length,
      programmingThemeCount: programmingScores.length,
      overallScore,
      overallPercentile: 0, // Will be calculated per-class
      strengthClassification,
      strengthDelta,
      growthSlope,
      growthTrend,
      scoreStandardDeviation: scoreStdDev,
      consistencyScore,
      consistencyLevel,
      totalSessions: entries.length,
      totalChallengesCompleted,
      averageRawCompletion,
    });
  }

  // Calculate percentiles within each class
  const classGroups = new Map<string, StudentProfile[]>();
  for (const profile of profiles) {
    if (!classGroups.has(profile.classId)) {
      classGroups.set(profile.classId, []);
    }
    classGroups.get(profile.classId)!.push(profile);
  }

  for (const classProfiles of classGroups.values()) {
    const allScores = classProfiles.map(p => p.overallScore);
    for (const profile of classProfiles) {
      profile.overallPercentile = percentile(profile.overallScore, allScores);
    }
  }

  return profiles;
}

// ============================================================================
// CLASS SUMMARY CALCULATION
// ============================================================================

function calculateClassSummaries(profiles: StudentProfile[]): ClassSummary[] {
  // Group profiles by class
  const classGroups = new Map<string, StudentProfile[]>();
  for (const profile of profiles) {
    if (!classGroups.has(profile.classId)) {
      classGroups.set(profile.classId, []);
    }
    classGroups.get(profile.classId)!.push(profile);
  }

  const summaries: ClassSummary[] = [];

  for (const [classId, classProfiles] of classGroups) {
    if (classProfiles.length === 0) continue;

    const firstProfile = classProfiles[0];
    const overallScores = classProfiles.map(p => p.overallScore);
    const mechanicalScores = classProfiles.filter(p => p.mechanicalThemeCount > 0).map(p => p.mechanicalScore);
    const programmingScores = classProfiles.filter(p => p.programmingThemeCount > 0).map(p => p.programmingScore);

    const avgMechanical = mean(mechanicalScores);
    const avgProgramming = mean(programmingScores);

    let domainStrength: 'Mechanical' | 'Programming' | 'Balanced' = 'Balanced';
    if (avgMechanical - avgProgramming > 5) {
      domainStrength = 'Mechanical';
    } else if (avgProgramming - avgMechanical > 5) {
      domainStrength = 'Programming';
    }

    // Growth counts
    const improving = classProfiles.filter(p => p.growthTrend === 'Improving').length;
    const stable = classProfiles.filter(p => p.growthTrend === 'Stable').length;
    const declining = classProfiles.filter(p => p.growthTrend === 'Declining').length;

    // Strength distribution
    const mechanicalStrength = classProfiles.filter(p => p.strengthClassification === 'Mechanical').length;
    const programmingStrength = classProfiles.filter(p => p.strengthClassification === 'Programming').length;
    const balanced = classProfiles.filter(p => p.strengthClassification === 'Balanced').length;

    // Top/bottom performers
    const sortedByScore = [...classProfiles].sort((a, b) => b.overallScore - a.overallScore);
    const topPerformers = sortedByScore.slice(0, 5).map(p => ({
      studentName: p.studentName,
      score: Math.round(p.overallScore * 10) / 10,
    }));
    const needsAttention = sortedByScore.slice(-5).reverse().map(p => ({
      studentName: p.studentName,
      score: Math.round(p.overallScore * 10) / 10,
    }));

    summaries.push({
      classId,
      className: firstProfile.className,
      totalStudents: classProfiles.length,
      studentsWithData: classProfiles.filter(p => p.totalSessions > 0).length,
      averageMechanicalScore: Math.round(avgMechanical * 10) / 10,
      averageProgrammingScore: Math.round(avgProgramming * 10) / 10,
      domainStrength,
      averageOverallScore: Math.round(mean(overallScores) * 10) / 10,
      medianOverallScore: Math.round(median(overallScores) * 10) / 10,
      scoreStandardDeviation: Math.round(standardDeviation(overallScores) * 10) / 10,
      scoreDistribution: getDistributionBuckets(overallScores),
      studentsImproving: improving,
      studentsStable: stable,
      studentsDeclining: declining,
      improvingPercent: (improving / classProfiles.length) * 100,
      decliningPercent: (declining / classProfiles.length) * 100,
      mechanicalStrengthCount: mechanicalStrength,
      programmingStrengthCount: programmingStrength,
      balancedCount: balanced,
      topPerformers,
      needsAttention,
    });
  }

  return summaries;
}

// ============================================================================
// MAIN ANALYTICS FUNCTION
// ============================================================================

export async function generateAnalytics(forceRefresh = false): Promise<AnalyticsResult> {
  // Check cache first (updates once per day to reduce egress)
  if (!forceRefresh) {
    const cached = getCachedAnalytics();
    if (cached) {
      return cached;
    }
  }

  console.log('📊 Generating student performance analytics...');
  const startTime = Date.now();

  // Step 1: Load raw data
  const rawData = await loadRawAnalyticsData();
  console.log(`  ✓ Loaded ${rawData.length} student-theme records`);

  if (rawData.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      totalStudents: 0,
      totalThemes: 0,
      totalSessions: 0,
      themeStatistics: [],
      themeDifficultyRanking: [],
      studentProfiles: [],
      classSummaries: [],
      globalMechanicalAverage: 0,
      globalProgrammingAverage: 0,
      globalDomainStrength: 'Balanced',
      hardestThemes: [],
      easiestThemes: [],
      studentAttributesMap: new Map(),
    };
  }

  // Step 2: Calculate theme statistics
  const themeStatistics = calculateThemeStatistics(rawData);
  console.log(`  ✓ Calculated statistics for ${themeStatistics.length} themes`);

  // Step 3: Calculate student profiles
  const studentProfiles = calculateStudentProfiles(rawData, themeStatistics);
  console.log(`  ✓ Generated profiles for ${studentProfiles.length} students`);

  // Step 4: Calculate class summaries
  const classSummaries = calculateClassSummaries(studentProfiles);
  console.log(`  ✓ Generated summaries for ${classSummaries.length} classes`);

  // Step 5: Load student attributes for scatter plot
  const attributesData = await loadAllStudentAttributes();
  const studentAttributesMap = buildStudentAttributesMap(studentProfiles, attributesData);
  console.log(`  ✓ Loaded attributes for ${attributesData.size} students (${studentAttributesMap.size} mapped)`);

  // Step 6: Calculate global metrics
  const mechanicalScores = studentProfiles
    .filter(p => p.mechanicalThemeCount > 0)
    .map(p => p.mechanicalScore);
  const programmingScores = studentProfiles
    .filter(p => p.programmingThemeCount > 0)
    .map(p => p.programmingScore);

  const globalMechanicalAverage = mean(mechanicalScores);
  const globalProgrammingAverage = mean(programmingScores);

  let globalDomainStrength: 'Mechanical' | 'Programming' | 'Balanced' = 'Balanced';
  if (globalMechanicalAverage - globalProgrammingAverage > 5) {
    globalDomainStrength = 'Mechanical';
  } else if (globalProgrammingAverage - globalMechanicalAverage > 5) {
    globalDomainStrength = 'Programming';
  }

  // Theme rankings
  const themeDifficultyRanking = themeStatistics.map(t => ({
    themeName: t.themeName,
    difficultyWeight: Math.round(t.difficultyWeight * 100) / 100,
    meanCompletion: Math.round(t.meanCompletion * 10) / 10,
  }));

  const hardestThemes = themeStatistics.slice(0, 3).map(t => ({
    name: t.themeName,
    meanCompletion: Math.round(t.meanCompletion * 10) / 10,
    category: t.themeCategory,
  }));

  const easiestThemes = [...themeStatistics]
    .sort((a, b) => b.meanCompletion - a.meanCompletion)
    .slice(0, 3)
    .map(t => ({
      name: t.themeName,
      meanCompletion: Math.round(t.meanCompletion * 10) / 10,
      category: t.themeCategory,
    }));

  const uniqueStudents = new Set(rawData.map(r => r.studentId)).size;

  const elapsed = Date.now() - startTime;
  console.log(`✅ Analytics generated in ${elapsed}ms`);

  const result: AnalyticsResult = {
    generatedAt: new Date().toISOString(),
    totalStudents: uniqueStudents,
    totalThemes: themeStatistics.length,
    totalSessions: rawData.length,
    themeStatistics,
    themeDifficultyRanking,
    studentProfiles,
    classSummaries,
    globalMechanicalAverage: Math.round(globalMechanicalAverage * 10) / 10,
    globalProgrammingAverage: Math.round(globalProgrammingAverage * 10) / 10,
    globalDomainStrength,
    hardestThemes,
    easiestThemes,
    studentAttributesMap,
  };

  // Cache the result for 24 hours to reduce egress
  setCachedAnalytics(result);

  return result;
}
