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
} from './analyticsTypes';

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
// DATA LOADING
// ============================================================================

async function loadRawAnalyticsData(): Promise<RawStudentThemeData[]> {
  // Load all progress data with theme and student info
  const { data: rosterData, error: rosterError } = await supabase
    .from('v_student_roster')
    .select('*')
    .order('last_updated', { ascending: true });

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
  const rawData: RawStudentThemeData[] = [];

  for (const row of rosterData || []) {
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
      timestamp: row.last_updated ? new Date(row.last_updated).getTime() : 0,
      date: row.last_updated || '',
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

export async function generateAnalytics(): Promise<AnalyticsResult> {
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

  // Step 5: Calculate global metrics
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

  return {
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
  };
}
