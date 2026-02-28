import { supabase } from './supabaseClient';
import { AppState, Theme, ClassSession, Student, StudentProgress, HistoryEntry, ThemeCategory, ProgressBackupData, ProgressBackupTheme, AttributesBackupData } from '../types';
import { DEFAULT_CLASSES } from '../constants';

// =============================================================================
// NEW DATABASE SCHEMA INTERFACES
// =============================================================================

interface StudentRow {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

interface ThemeRow {
  id: string;
  name: string;
  challenge_1: string;
  challenge_2: string;
  challenge_3: string;
  challenge_4: string;
  challenge_5: string;
  category?: string | null; // 'mechanical' or 'programming'
  created_at?: string;
  updated_at?: string;
}

interface StudentAssignmentRow {
  student_id: string;
  theme_id: string;
  class_session_id: string;
  assigned_at?: string;
}

interface StudentProgressRow {
  id: string;
  student_id: string;
  theme_id: string;
  class_session_id: string;
  challenge_1_completed: boolean;
  challenge_2_completed: boolean;
  challenge_3_completed: boolean;
  challenge_4_completed: boolean;
  challenge_5_completed: boolean;
  last_updated: string;
  completed_at?: string | null;
}

interface RosterViewRow {
  student_id: string;
  student_name: string;
  theme_id: string;
  theme_name: string;
  class_session_id: string;
  class_session_name: string;
  c1: boolean;
  c2: boolean;
  c3: boolean;
  c4: boolean;
  c5: boolean;
  last_updated?: string | null;
  assigned_at: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error(`Error getting setting ${key}:`, error);
    return null;
  }
  return data?.value || null;
}

async function setAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    console.error(`Error setting ${key}:`, error);
  }
}

// =============================================================================
// STATE CACHING (reduces egress by caching app state for 5 minutes)
// =============================================================================

const STATE_CACHE_KEY = 'ct_app_state_cache';
const STATE_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface StateCache {
  data: AppState;
  timestamp: number;
}

function getCachedState(): AppState | null {
  try {
    const cached = localStorage.getItem(STATE_CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp }: StateCache = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age < STATE_CACHE_DURATION_MS) {
      console.log(`📦 Using cached state (${Math.round(age / 1000)}s old)`);
      return data;
    }

    console.log('📦 State cache expired, will refresh');
    return null;
  } catch (error) {
    console.error('Error reading state cache:', error);
    return null;
  }
}

function setCachedState(data: AppState): void {
  try {
    const cache: StateCache = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(cache));
    console.log('📦 State cached for 5 minutes');
  } catch (error) {
    console.error('Error caching state:', error);
  }
}

export function clearStateCache(): void {
  localStorage.removeItem(STATE_CACHE_KEY);
  console.log('📦 State cache cleared');
}

// =============================================================================
// PUBLIC VIEW CACHE (48 hours, per theme+class, with DB change detection)
// Separate from the main state cache — only used by LivePublicView
// =============================================================================

const PUBLIC_VIEW_CACHE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours

interface PublicViewCacheEntry {
  data: AppState;
  timestamp: number;
  themeId: string;
  dbLastUpdated: string | null;
}

function getPublicViewCacheKey(themeName: string, classId: string): string {
  return `ct_pv_${themeName.replace(/\s+/g, '_')}_${classId}`;
}

function getCachedPublicView(themeName: string, classId: string): PublicViewCacheEntry | null {
  try {
    const key = getPublicViewCacheKey(themeName, classId);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const entry: PublicViewCacheEntry = JSON.parse(cached);
    const age = Date.now() - entry.timestamp;
    if (age < PUBLIC_VIEW_CACHE_DURATION_MS) {
      return entry;
    }
    console.log(`📦 Public view cache expired for ${themeName}/${classId}`);
    return null;
  } catch {
    return null;
  }
}

function setCachedPublicView(
  themeName: string,
  classId: string,
  data: AppState,
  themeId: string,
  dbLastUpdated: string | null
): void {
  try {
    const key = getPublicViewCacheKey(themeName, classId);
    const entry: PublicViewCacheEntry = { data, timestamp: Date.now(), themeId, dbLastUpdated };
    localStorage.setItem(key, JSON.stringify(entry));
    console.log(`📦 Public view cached (48h): ${themeName}/${classId}`);
  } catch (error) {
    console.error('Error caching public view:', error);
  }
}

async function getPublicViewDbLastUpdated(themeId: string, classId: string): Promise<string | null> {
  const { data } = await supabase
    .from('student_progress')
    .select('last_updated')
    .eq('theme_id', themeId)
    .eq('class_session_id', classId)
    .order('last_updated', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_updated || null;
}

// Load public view data for a specific theme+class from DB, then cache result
async function loadPublicViewStateByClassFromDB(themeName: string, classId: string): Promise<AppState> {
  const startTime = Date.now();
  console.log(`📊 Loading public view from DB: ${themeName}/${classId}`);

  const { data: rosterData, error } = await supabase
    .from('v_student_roster')
    .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated, assigned_at')
    .eq('theme_name', themeName)
    .eq('class_session_id', classId);

  if (error) {
    console.error('Error loading public roster:', error);
    return getDefaultAppState();
  }

  // Load theme details
  const { data: themeData } = await supabase
    .from('themes')
    .select('id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5')
    .eq('name', themeName)
    .single();

  if (!themeData) {
    console.error('Theme not found:', themeName);
    return getDefaultAppState();
  }

  const studentMap = new Map<string, Student>();
  (rosterData as RosterViewRow[] || []).forEach(row => {
    if (!studentMap.has(row.student_id)) {
      studentMap.set(row.student_id, { id: row.student_id, name: row.student_name });
    }
  });

  const theme: Theme = {
    name: themeData.name,
    challenges: [
      themeData.challenge_1,
      themeData.challenge_2,
      themeData.challenge_3,
      themeData.challenge_4,
      themeData.challenge_5
    ],
    classes: [{
      id: classId,
      name: DEFAULT_CLASSES.find(c => c.id === classId)?.name || classId,
      students: Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }]
  };

  const progress: Record<string, StudentProgress> = {};
  let maxLastUpdated: string | null = null;

  (rosterData as RosterViewRow[] || []).forEach(row => {
    const key = `${classId}_${row.student_id}_${themeName}`;
    const challengesCompleted: string[] = [];
    if (row.c1) challengesCompleted.push('c1');
    if (row.c2) challengesCompleted.push('c2');
    if (row.c3) challengesCompleted.push('c3');
    if (row.c4) challengesCompleted.push('c4');
    if (row.c5) challengesCompleted.push('c5');

    progress[key] = {
      studentId: row.student_id,
      studentName: row.student_name,
      challengesCompleted,
      timestamp: row.last_updated ? new Date(row.last_updated).getTime() : 0
    };

    if (row.last_updated && (!maxLastUpdated || row.last_updated > maxLastUpdated)) {
      maxLastUpdated = row.last_updated;
    }
  });

  const result: AppState = {
    themes: [theme],
    currentWeekTheme: themeName,
    publicThemeName: themeName,
    publicClassId: classId,
    selectedClassId: classId,
    progress
  };

  console.log(`✅ Public view loaded from DB in ${Date.now() - startTime}ms`);

  setCachedPublicView(themeName, classId, result, themeData.id, maxLastUpdated);

  return result;
}

// Exported: load public view state for a specific theme+class with 48hr cache
// and DB-change detection. Used exclusively by LivePublicView.
export const loadPublicViewStateByClass = async (
  themeName: string,
  classId: string
): Promise<AppState> => {
  const cached = getCachedPublicView(themeName, classId);

  if (cached) {
    try {
      const currentDbTimestamp = await getPublicViewDbLastUpdated(cached.themeId, classId);
      if (currentDbTimestamp === cached.dbLastUpdated) {
        console.log(`📦 Serving public view from cache: ${themeName}/${classId}`);
        return cached.data;
      }
      console.log(`📦 DB updated since last cache, refreshing: ${themeName}/${classId}`);
    } catch {
      console.warn('📦 DB change check failed, using cached data');
      return cached.data;
    }
  }

  return loadPublicViewStateByClassFromDB(themeName, classId);
};

// =============================================================================
// LOAD STATE FROM DATABASE
// =============================================================================

export const loadState = async (forceRefresh = false): Promise<AppState> => {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCachedState();
    if (cached) {
      return cached;
    }
  }

  try {
    console.log('🔄 Loading state from database...');
    const startTime = Date.now();

    // 1. Load all themes (excluding large image columns to reduce egress)
    const { data: themesData, error: themesError } = await supabase
      .from('themes')
      .select('id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, category, created_at, updated_at')
      .order('created_at', { ascending: true });

    if (themesError) {
      console.error('✗ Error loading themes:', themesError);
      return getDefaultAppState();
    }

    if (!themesData || themesData.length === 0) {
      console.log('ℹ No themes in database, using defaults');
      return getDefaultAppState();
    }

    // 2. Load all students (only needed columns)
    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select('id, name')
      .order('name', { ascending: true });

    if (studentsError) {
      console.error('✗ Error loading students:', studentsError);
    }

    // 3. Load all assignments (only needed columns)
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from('student_assignments')
      .select('student_id, theme_id, class_session_id');

    if (assignmentsError) {
      console.error('✗ Error loading assignments:', assignmentsError);
    }

    // 4. Load all progress (only needed columns)
    const { data: progressData, error: progressError } = await supabase
      .from('student_progress')
      .select('id, student_id, theme_id, class_session_id, challenge_1_completed, challenge_2_completed, challenge_3_completed, challenge_4_completed, challenge_5_completed, last_updated');

    if (progressError) {
      console.error('✗ Error loading progress:', progressError);
    }

    // Log approximate payload sizes for egress monitoring
    const themesSize = JSON.stringify(themesData).length;
    const studentsSize = JSON.stringify(studentsData || []).length;
    const assignmentsSize = JSON.stringify(assignmentsData || []).length;
    const progressSize = JSON.stringify(progressData || []).length;
    const totalSize = themesSize + studentsSize + assignmentsSize + progressSize;

    console.log(`✓ Loaded: ${themesData.length} themes, ${studentsData?.length || 0} students, ${assignmentsData?.length || 0} assignments, ${progressData?.length || 0} progress records`);
    console.log(`📊 Egress estimate: ${(totalSize / 1024).toFixed(2)} KB (themes: ${(themesSize / 1024).toFixed(2)} KB, students: ${(studentsSize / 1024).toFixed(2)} KB, assignments: ${(assignmentsSize / 1024).toFixed(2)} KB, progress: ${(progressSize / 1024).toFixed(2)} KB)`);

    // 5. Build AppState structure
    const themes: Theme[] = themesData.map((themeRow: ThemeRow) => {
      // Get all class sessions and populate with students
      const classes: ClassSession[] = DEFAULT_CLASSES.map(defaultClass => {
        // Find students assigned to this class for this theme
        const classAssignments = (assignmentsData || []).filter(
          (a: StudentAssignmentRow) =>
            a.theme_id === themeRow.id && a.class_session_id === defaultClass.id
        );

        const students: Student[] = classAssignments
          .map((assignment: StudentAssignmentRow) => {
            const student = (studentsData || []).find(
              (s: StudentRow) => s.id === assignment.student_id
            );
            return student ? { id: student.id, name: student.name } : null;
          })
          .filter(Boolean) as Student[];

        return {
          id: defaultClass.id,
          name: defaultClass.name,
          students: students.sort((a, b) => a.name.localeCompare(b.name)),
        };
      });

      return {
        name: themeRow.name,
        challenges: [
          themeRow.challenge_1,
          themeRow.challenge_2,
          themeRow.challenge_3,
          themeRow.challenge_4,
          themeRow.challenge_5,
        ],
        classes,
        category: (themeRow.category as ThemeCategory) || undefined,
      };
    });

    // 6. Build progress object from database
    const progress: Record<string, StudentProgress> = {};

    if (progressData && progressData.length > 0) {
      for (const prog of progressData as StudentProgressRow[]) {
        const student = (studentsData || []).find((s: StudentRow) => s.id === prog.student_id);
        const theme = themesData.find((t: ThemeRow) => t.id === prog.theme_id);

        if (student && theme) {
          // Build challenge IDs array from boolean columns
          const challengesCompleted: string[] = [];
          if (prog.challenge_1_completed) challengesCompleted.push('c1');
          if (prog.challenge_2_completed) challengesCompleted.push('c2');
          if (prog.challenge_3_completed) challengesCompleted.push('c3');
          if (prog.challenge_4_completed) challengesCompleted.push('c4');
          if (prog.challenge_5_completed) challengesCompleted.push('c5');

          // Key format: classId_studentId_themeName
          const key = `${prog.class_session_id}_${prog.student_id}_${theme.name}`;

          progress[key] = {
            studentId: prog.student_id,
            studentName: student.name,
            challengesCompleted,
            timestamp: new Date(prog.last_updated).getTime(),
          };
        }
      }
    }

    console.log(`✓ Built ${Object.keys(progress).length} progress entries`);

    // 7. Load app settings
    const currentWeekThemeName = (await getAppSetting('current_week_theme_id')) || themes[0]?.name || '';
    const publicThemeName = (await getAppSetting('public_theme_id')) || currentWeekThemeName;
    const publicClassId = (await getAppSetting('public_class_id')) || DEFAULT_CLASSES[0].id;
    const selectedClassId = (await getAppSetting('selected_class_id')) || DEFAULT_CLASSES[0].id;

    const elapsed = Date.now() - startTime;
    console.log(`✅ State loaded in ${elapsed}ms`);

    const result: AppState = {
      themes,
      currentWeekTheme: currentWeekThemeName,
      publicThemeName,
      publicClassId,
      selectedClassId,
      progress,
    };

    // Cache the result for 5 minutes
    setCachedState(result);

    return result;
  } catch (error) {
    console.error('✗ Fatal error loading state:', error);
    return getDefaultAppState();
  }
};

// =============================================================================
// LOAD DASHBOARD STATE (optimized: only loads the selected theme's data)
// =============================================================================

export const loadDashboardState = async (selectedThemeName?: string): Promise<AppState> => {
  try {
    console.log('🔄 Loading dashboard state (theme-scoped)...');
    const startTime = Date.now();

    // 1. Load all themes metadata (lightweight — just names + challenges)
    const { data: themesData, error: themesError } = await supabase
      .from('themes')
      .select('id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, category, created_at')
      .order('created_at', { ascending: true });

    if (themesError || !themesData?.length) {
      console.error('✗ Error loading themes:', themesError);
      return getDefaultAppState();
    }

    // 2. Resolve app settings in parallel
    const [currentWeekThemeName, publicThemeName, publicClassId, selectedClassId] = await Promise.all([
      getAppSetting('current_week_theme_id'),
      getAppSetting('public_theme_id'),
      getAppSetting('public_class_id'),
      getAppSetting('selected_class_id'),
    ]);

    const resolvedCurrentTheme = currentWeekThemeName || themesData[themesData.length - 1]?.name || '';
    const targetThemeName = selectedThemeName || resolvedCurrentTheme;
    const targetThemeRow = themesData.find((t: ThemeRow) => t.name === targetThemeName) || themesData[themesData.length - 1];

    // 3. Load assignments + progress for the target theme only (in parallel)
    const [assignmentsResult, progressResult] = await Promise.all([
      supabase
        .from('student_assignments')
        .select('student_id, theme_id, class_session_id')
        .eq('theme_id', targetThemeRow.id),
      supabase
        .from('student_progress')
        .select('student_id, theme_id, class_session_id, challenge_1_completed, challenge_2_completed, challenge_3_completed, challenge_4_completed, challenge_5_completed, last_updated')
        .eq('theme_id', targetThemeRow.id),
    ]);

    const assignmentsData = assignmentsResult.data || [];
    const progressData = progressResult.data || [];

    // 4. Load only students assigned to this theme
    const studentIds = [...new Set(assignmentsData.map((a: StudentAssignmentRow) => a.student_id))];
    let studentsData: StudentRow[] = [];
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from('students')
        .select('id, name')
        .in('id', studentIds);
      studentsData = data || [];
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Dashboard state loaded in ${elapsed}ms (theme: ${targetThemeRow.name}, ${studentsData.length} students, ${progressData.length} progress records)`);

    // 5. Build themes array — all themes have metadata, only the active theme has populated classes
    const themes: Theme[] = themesData.map((themeRow: ThemeRow) => {
      const isActive = themeRow.id === targetThemeRow.id;
      const classes: ClassSession[] = DEFAULT_CLASSES.map(defaultClass => {
        if (!isActive) return { id: defaultClass.id, name: defaultClass.name, students: [] };

        const classAssignments = assignmentsData.filter(
          (a: StudentAssignmentRow) => a.class_session_id === defaultClass.id
        );
        const students: Student[] = classAssignments
          .map((a: StudentAssignmentRow) => studentsData.find((s: StudentRow) => s.id === a.student_id))
          .filter(Boolean)
          .map((s: any) => ({ id: s.id, name: s.name }))
          .sort((a: Student, b: Student) => a.name.localeCompare(b.name));

        return { id: defaultClass.id, name: defaultClass.name, students };
      });

      return {
        name: themeRow.name,
        challenges: [themeRow.challenge_1, themeRow.challenge_2, themeRow.challenge_3, themeRow.challenge_4, themeRow.challenge_5],
        classes,
        category: (themeRow.category as ThemeCategory) || undefined,
      };
    });

    // 6. Build progress for the target theme only
    const progress: Record<string, StudentProgress> = {};
    for (const prog of progressData as StudentProgressRow[]) {
      const student = studentsData.find((s: StudentRow) => s.id === prog.student_id);
      if (student) {
        const challengesCompleted: string[] = [];
        if (prog.challenge_1_completed) challengesCompleted.push('c1');
        if (prog.challenge_2_completed) challengesCompleted.push('c2');
        if (prog.challenge_3_completed) challengesCompleted.push('c3');
        if (prog.challenge_4_completed) challengesCompleted.push('c4');
        if (prog.challenge_5_completed) challengesCompleted.push('c5');

        const key = `${prog.class_session_id}_${prog.student_id}_${targetThemeRow.name}`;
        progress[key] = {
          studentId: prog.student_id,
          studentName: student.name,
          challengesCompleted,
          timestamp: new Date(prog.last_updated).getTime(),
        };
      }
    }

    return {
      themes,
      currentWeekTheme: targetThemeName,
      publicThemeName: publicThemeName || resolvedCurrentTheme,
      publicClassId: publicClassId || DEFAULT_CLASSES[0].id,
      selectedClassId: selectedClassId || DEFAULT_CLASSES[0].id,
      progress,
    };
  } catch (error) {
    console.error('✗ Fatal error loading dashboard state:', error);
    return getDefaultAppState();
  }
};

// =============================================================================
// SAVE DASHBOARD PROGRESS (targeted: only saves current theme's progress + settings)
// =============================================================================

export const saveDashboardProgress = async (state: AppState): Promise<void> => {
  if (!state.currentWeekTheme || !state.progress) return;

  try {
    console.log('💾 Saving dashboard progress (theme-scoped)...');
    const startTime = Date.now();

    // 1. Resolve the current theme's DB id
    const { data: themeRow, error: themeError } = await supabase
      .from('themes')
      .select('id')
      .eq('name', state.currentWeekTheme)
      .single();

    if (themeError || !themeRow) {
      console.error('  ✗ Theme not found for progress save:', state.currentWeekTheme);
      throw new Error('Theme not found');
    }

    const themeId = themeRow.id;

    // 2. Build progress rows only for the current theme
    const progressArray: any[] = [];

    for (const [key, prog] of Object.entries(state.progress)) {
      const parts = key.split('_');
      if (parts.length < 3) continue;

      const classSessionId = parts[0];
      const studentId = parts[1];
      const themeName = parts.slice(2).join('_');

      if (themeName !== state.currentWeekTheme) continue;

      progressArray.push({
        student_id: studentId,
        theme_id: themeId,
        class_session_id: classSessionId,
        challenge_1_completed: prog.challengesCompleted.includes('c1'),
        challenge_2_completed: prog.challengesCompleted.includes('c2'),
        challenge_3_completed: prog.challengesCompleted.includes('c3'),
        challenge_4_completed: prog.challengesCompleted.includes('c4'),
        challenge_5_completed: prog.challengesCompleted.includes('c5'),
        last_updated: new Date(prog.timestamp || Date.now()).toISOString(),
      });
    }

    // 3. Batch upsert progress (single DB call)
    if (progressArray.length > 0) {
      const { error } = await supabase
        .from('student_progress')
        .upsert(progressArray, { onConflict: 'student_id,theme_id' });

      if (error) {
        console.error('  ✗ Error saving progress:', error);
        throw error;
      }
      console.log(`  ✓ Saved ${progressArray.length} progress records`);
    }

    // 4. Save only the two settings the Dashboard controls
    await Promise.all([
      setAppSetting('current_week_theme_id', state.currentWeekTheme),
      setAppSetting('selected_class_id', state.selectedClassId),
    ]);

    console.log(`✅ Dashboard progress saved in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('✗ Fatal error saving dashboard progress:', error);
    throw error;
  }
};

// =============================================================================
// SAVE STATE TO DATABASE
// =============================================================================

export const saveState = async (state: AppState): Promise<void> => {
  // Guard: never save an empty/default state — this would wipe all DB data
  if (!state.themes || state.themes.length === 0) {
    console.warn('💾 saveState called with empty themes — aborting to protect DB data');
    return;
  }

  try {
    console.log('💾 Saving state to database...');
    const startTime = Date.now();

    // Get theme ID map (name -> id)
    const { data: existingThemes } = await supabase
      .from('themes')
      .select('id, name');

    // Guard: abort if state has fewer themes than the DB.
    // A partial-state save would delete assignments/progress for the missing themes.
    const dbThemeCount = (existingThemes || []).length;
    if (dbThemeCount > 0 && state.themes.length < dbThemeCount) {
      console.warn(
        `💾 saveState aborted: state has ${state.themes.length} theme(s) but DB has ${dbThemeCount} — partial state detected, aborting to protect data`
      );
      return;
    }

    const themeIdMap = new Map<string, string>();
    (existingThemes || []).forEach((t: any) => themeIdMap.set(t.name, t.id));

    // 1. UPSERT THEMES (batch operation)
    console.log('  📝 Saving themes...');
    const themesArray = state.themes.map(theme => ({
      name: theme.name,
      challenge_1: theme.challenges[0] || 'Challenge 1',
      challenge_2: theme.challenges[1] || 'Challenge 2',
      challenge_3: theme.challenges[2] || 'Challenge 3',
      challenge_4: theme.challenges[3] || 'Challenge 4',
      challenge_5: theme.challenges[4] || 'Challenge 5',
      category: theme.category || null,
      updated_at: new Date().toISOString(),
    }));

    if (themesArray.length > 0) {
      const { data, error } = await supabase
        .from('themes')
        .upsert(themesArray, { onConflict: 'name' })
        .select('id, name');

      if (error) {
        console.error('  ✗ Error batch saving themes:', error);
      } else if (data) {
        data.forEach((t: any) => themeIdMap.set(t.name, t.id));
        console.log(`  ✓ Batch saved ${data.length} themes`);
      }
    }

    // 2. COLLECT ALL UNIQUE STUDENTS ACROSS ALL THEMES
    console.log('  👥 Saving students...');
    const allStudents = new Map<string, Student>();

    for (const theme of state.themes) {
      for (const classSession of theme.classes) {
        for (const student of classSession.students) {
          if (!allStudents.has(student.id)) {
            allStudents.set(student.id, student);
          }
        }
      }
    }

    // Batch upsert all students (single DB call instead of N calls)
    const studentsArray = Array.from(allStudents.values()).map(student => ({
      id: student.id,
      name: student.name,
      updated_at: new Date().toISOString(),
    }));

    if (studentsArray.length > 0) {
      const { error } = await supabase
        .from('students')
        .upsert(studentsArray, { onConflict: 'id' });

      if (error) {
        console.error('  ✗ Error batch saving students:', error);
      } else {
        console.log(`  ✓ Batch saved ${studentsArray.length} students`);
      }
    }

    // 3. SAVE STUDENT ASSIGNMENTS (roster)
    console.log('  📋 Saving assignments...');

    // Build current assignments from state
    const currentAssignments: StudentAssignmentRow[] = [];
    for (const theme of state.themes) {
      const themeId = themeIdMap.get(theme.name);
      if (!themeId) continue;

      for (const classSession of theme.classes) {
        for (const student of classSession.students) {
          // If student is unassigned, only keep their assignment record if they
          // have in-progress challenges for this theme. Otherwise, let it be
          // cleaned up as an orphaned assignment.
          if (classSession.id === 'unassigned') {
            const hasProgress = Object.entries(state.progress).some(([key, prog]) => {
              const parts = key.split('_');
              if (parts.length < 3) return false;
              const keyStudentId = parts[1];
              const keyThemeName = parts.slice(2).join('_');
              return keyStudentId === student.id && keyThemeName === theme.name && prog.challengesCompleted.length > 0;
            });
            if (!hasProgress) continue;
          }

          currentAssignments.push({
            student_id: student.id,
            theme_id: themeId,
            class_session_id: classSession.id,
          });
        }
      }
    }

    // Delete old assignments and insert new ones.
    // IMPORTANT: only delete assignments within themes that are present in the
    // current state. Never delete assignments for themes we didn't load — those
    // themes simply weren't part of this save and must be left untouched.
    const managedThemeIds = new Set(currentAssignments.map(a => a.theme_id));

    const { data: existingAssignments } = await supabase
      .from('student_assignments')
      .select('student_id, theme_id, class_session_id');

    // Find assignments to delete: only within managed themes AND no longer in state
    const currentKeys = new Set(
      currentAssignments.map(a => `${a.student_id}_${a.theme_id}`)
    );

    const toDelete = (existingAssignments || []).filter(
      (a: any) =>
        managedThemeIds.has(a.theme_id) &&
        !currentKeys.has(`${a.student_id}_${a.theme_id}`)
    );

    // Batch delete orphaned assignments (within managed themes only)
    if (toDelete.length > 0) {
      for (const assignment of toDelete) {
        await supabase
          .from('student_assignments')
          .delete()
          .eq('student_id', assignment.student_id)
          .eq('theme_id', assignment.theme_id);
      }
      console.log(`  ✓ Deleted ${toDelete.length} orphaned assignments`);
    }

    // Batch upsert current assignments (single DB call instead of N calls)
    if (currentAssignments.length > 0) {
      const { error } = await supabase
        .from('student_assignments')
        .upsert(currentAssignments, { onConflict: 'student_id,theme_id' });

      if (error) {
        console.error('  ✗ Error batch saving assignments:', error);
      } else {
        console.log(`  ✓ Batch saved ${currentAssignments.length} assignments`);
      }
    }

    // 3b. DELETE PROGRESS FOR STUDENTS MOVED TO UNASSIGNED
    // If a student is moved to unassigned, remove their progress records
    console.log('  🗑️  Cleaning up progress for unassigned students...');
    let progressDeleted = 0;

    const unassignedStudents = currentAssignments.filter(a => a.class_session_id === 'unassigned');
    for (const assignment of unassignedStudents) {
      const { error } = await supabase
        .from('student_progress')
        .delete()
        .eq('student_id', assignment.student_id)
        .eq('theme_id', assignment.theme_id);

      if (!error) {
        progressDeleted++;
      }
    }

    if (progressDeleted > 0) {
      console.log(`  ✓ Deleted ${progressDeleted} progress records for unassigned students`);
    }

    // 4. SAVE STUDENT PROGRESS (batch operation)
    console.log('  ✅ Saving progress...');
    const progressArray: any[] = [];
    let progressErrors = 0;

    for (const [key, prog] of Object.entries(state.progress)) {
      const parts = key.split('_');
      if (parts.length < 3) {
        console.warn(`  ⚠ Invalid progress key: ${key}`);
        progressErrors++;
        continue;
      }

      const classSessionId = parts[0];
      const studentId = parts[1];
      const themeName = parts.slice(2).join('_');
      const themeId = themeIdMap.get(themeName);

      if (!themeId) {
        console.warn(`  ⚠ Theme not found for progress: ${themeName}`);
        progressErrors++;
        continue;
      }

      // Convert challenge IDs to boolean columns
      progressArray.push({
        student_id: studentId,
        theme_id: themeId,
        class_session_id: classSessionId,
        challenge_1_completed: prog.challengesCompleted.includes('c1'),
        challenge_2_completed: prog.challengesCompleted.includes('c2'),
        challenge_3_completed: prog.challengesCompleted.includes('c3'),
        challenge_4_completed: prog.challengesCompleted.includes('c4'),
        challenge_5_completed: prog.challengesCompleted.includes('c5'),
        last_updated: new Date(prog.timestamp || Date.now()).toISOString(),
      });
    }

    // Batch upsert all progress records (single DB call instead of N calls)
    if (progressArray.length > 0) {
      const { error } = await supabase
        .from('student_progress')
        .upsert(progressArray, { onConflict: 'student_id,theme_id' });

      if (error) {
        console.error('  ✗ Error batch saving progress:', error);
        progressErrors++;
      } else {
        console.log(`  ✓ Batch saved ${progressArray.length} progress records`);
      }
    }

    if (progressErrors > 0) {
      console.log(`  ⚠ ${progressErrors} progress errors`);
    }

    // 4b. ENSURE ALL ASSIGNED STUDENTS HAVE PROGRESS RECORDS (even if empty)
    // Skip students in "unassigned" - they shouldn't have progress records
    console.log('  📝 Ensuring all assigned students have progress records...');
    let progressInitialized = 0;

    for (const assignment of currentAssignments) {
      // Skip unassigned students - they shouldn't appear in history/search
      if (assignment.class_session_id === 'unassigned') {
        continue;
      }

      // Check if progress already exists for this student-theme combination
      const existingProgress = Object.entries(state.progress).find(([key]) => {
        const parts = key.split('_');
        if (parts.length < 3) return false;
        const studentId = parts[1];
        const themeName = parts.slice(2).join('_');
        const themeId = themeIdMap.get(themeName);
        return studentId === assignment.student_id && themeId === assignment.theme_id;
      });

      // If no progress exists, create an empty progress record.
      // IMPORTANT: ignoreDuplicates:true means this only INSERTs new records —
      // it will never overwrite existing progress data for this student+theme.
      if (!existingProgress) {
        const { error } = await supabase
          .from('student_progress')
          .upsert({
            student_id: assignment.student_id,
            theme_id: assignment.theme_id,
            class_session_id: assignment.class_session_id,
            challenge_1_completed: false,
            challenge_2_completed: false,
            challenge_3_completed: false,
            challenge_4_completed: false,
            challenge_5_completed: false,
            last_updated: new Date().toISOString(),
          }, { onConflict: 'student_id,theme_id', ignoreDuplicates: true });

        if (!error) {
          progressInitialized++;
        }
      }
    }

    if (progressInitialized > 0) {
      console.log(`  ✓ Initialized ${progressInitialized} empty progress records`);
    }

    // 5. SAVE APP SETTINGS
    await setAppSetting('current_week_theme_id', state.currentWeekTheme);
    await setAppSetting('public_theme_id', state.publicThemeName);
    await setAppSetting('public_class_id', state.publicClassId);
    await setAppSetting('selected_class_id', state.selectedClassId);

    const elapsed = Date.now() - startTime;
    console.log(`✅ State saved in ${elapsed}ms`);
  } catch (error) {
    console.error('✗ Fatal error saving state:', error);
    throw error;
  }
};

// =============================================================================
// HISTORY FUNCTIONS (for reporting/analytics only)
// =============================================================================

export const loadHistory = async (): Promise<HistoryEntry[]> => {
  try {
    // Generate history from progress data (select only needed columns)
    // Limit to 1000 rows to prevent excessive egress
    const { data: progressData, error } = await supabase
      .from('v_student_roster')
      .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated, assigned_at')
      .order('last_updated', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Error loading history:', error);
      return [];
    }

    if (!progressData || progressData.length === 0) {
      return [];
    }

    // FIX N+1: Load all themes ONCE instead of querying per row
    const { data: allThemes } = await supabase
      .from('themes')
      .select('id, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, created_at');

    const themeMap = new Map(allThemes?.map(t => [t.id, t]) || []);

    // Convert roster view to history entries
    const history: HistoryEntry[] = [];

    for (const row of progressData as RosterViewRow[]) {
      if (!row.last_updated) continue; // Skip students with no progress

      // Use Map lookup instead of database query (O(1) vs N queries)
      const themeData = themeMap.get(row.theme_id);
      if (!themeData) continue;

      const allChallenges = [
        themeData.challenge_1,
        themeData.challenge_2,
        themeData.challenge_3,
        themeData.challenge_4,
        themeData.challenge_5,
      ];

      const completedChallenges: string[] = [];
      if (row.c1) completedChallenges.push(allChallenges[0]);
      if (row.c2) completedChallenges.push(allChallenges[1]);
      if (row.c3) completedChallenges.push(allChallenges[2]);
      if (row.c4) completedChallenges.push(allChallenges[3]);
      if (row.c5) completedChallenges.push(allChallenges[4]);

      const date = new Date(row.last_updated);

      history.push({
        id: `${row.student_id}_${row.theme_id}_${date.toISOString()}`,
        studentName: row.student_name,
        className: row.class_session_name,
        weekName: `Session ${date.toLocaleDateString()}`,
        weekTheme: row.theme_name,
        challenges: completedChallenges,
        allAvailableChallenges: allChallenges,
        date: row.last_updated,
        themeCreatedAt: themeData.created_at || undefined,
      });
    }

    return history;
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
};

export const saveHistory = async (_history: HistoryEntry[]): Promise<void> => {
  // History is now read-only and generated from progress
  // This function is kept for compatibility but does nothing
  console.log('ℹ History is generated from progress, no save needed');
};

// =============================================================================
// PAGINATED HISTORY LOADING (lazy loading for History page)
// =============================================================================

export interface PaginatedHistoryResult {
  entries: HistoryEntry[];
  hasMore: boolean;
  totalCount: number;
}

export const loadHistoryPaginated = async (
  offset: number = 0,
  limit: number = 20
): Promise<PaginatedHistoryResult> => {
  try {
    console.log(`📖 Loading history page: offset=${offset}, limit=${limit}`);

    // Get total count for "has more" calculation
    const { count, error: countError } = await supabase
      .from('v_student_roster')
      .select('*', { count: 'exact', head: true })
      .not('last_updated', 'is', null);

    if (countError) {
      console.error('Error getting history count:', countError);
    }

    const totalCount = count || 0;

    // Fetch paginated data
    const { data: progressData, error } = await supabase
      .from('v_student_roster')
      .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated, assigned_at')
      .not('last_updated', 'is', null)
      .order('last_updated', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error loading paginated history:', error);
      return { entries: [], hasMore: false, totalCount: 0 };
    }

    if (!progressData || progressData.length === 0) {
      return { entries: [], hasMore: false, totalCount };
    }

    // Load theme data for challenge names (only for themes in this page)
    const themeIds = [...new Set((progressData as RosterViewRow[]).map(r => r.theme_id))];
    const { data: allThemes } = await supabase
      .from('themes')
      .select('id, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, created_at')
      .in('id', themeIds);

    const themeMap = new Map(allThemes?.map(t => [t.id, t]) || []);

    // Convert to history entries
    const entries: HistoryEntry[] = [];

    for (const row of progressData as RosterViewRow[]) {
      const themeData = themeMap.get(row.theme_id);
      if (!themeData) continue;

      const allChallenges = [
        themeData.challenge_1,
        themeData.challenge_2,
        themeData.challenge_3,
        themeData.challenge_4,
        themeData.challenge_5,
      ];

      const completedChallenges: string[] = [];
      if (row.c1) completedChallenges.push(allChallenges[0]);
      if (row.c2) completedChallenges.push(allChallenges[1]);
      if (row.c3) completedChallenges.push(allChallenges[2]);
      if (row.c4) completedChallenges.push(allChallenges[3]);
      if (row.c5) completedChallenges.push(allChallenges[4]);

      const date = new Date(row.last_updated);

      entries.push({
        id: `${row.student_id}_${row.theme_id}_${date.toISOString()}`,
        studentName: row.student_name,
        className: row.class_session_name,
        weekName: `Session ${date.toLocaleDateString()}`,
        weekTheme: row.theme_name,
        challenges: completedChallenges,
        allAvailableChallenges: allChallenges,
        date: row.last_updated,
        themeCreatedAt: themeData.created_at || undefined,
      });
    }

    const hasMore = offset + entries.length < totalCount;
    console.log(`✅ Loaded ${entries.length} entries, hasMore: ${hasMore}, total: ${totalCount}`);

    return { entries, hasMore, totalCount };
  } catch (error) {
    console.error('Fatal error loading paginated history:', error);
    return { entries: [], hasMore: false, totalCount: 0 };
  }
};

// =============================================================================
// OPTIMIZED PUBLIC VIEW LOADING
// =============================================================================

export const getPublicSettings = async (): Promise<{
  publicThemeName: string;
  publicClassId: string;
}> => {
  const [themeName, classId] = await Promise.all([
    getAppSetting('public_theme_id'),
    getAppSetting('public_class_id')
  ]);

  return {
    publicThemeName: themeName || '',
    publicClassId: classId || 'sat-am1'
  };
};

export const loadPublicViewState = async (): Promise<AppState> => {
  const startTime = Date.now();
  console.log('📊 Loading public view state...');

  // 1. Get current public settings
  const { publicThemeName, publicClassId } = await getPublicSettings();

  if (!publicThemeName) {
    console.log('No public theme set');
    return getDefaultAppState();
  }

  // 2. Load ONLY the public theme and class data using the optimized view (select only needed columns)
  const { data: rosterData, error } = await supabase
    .from('v_student_roster')
    .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated, assigned_at')
    .eq('theme_name', publicThemeName)
    .eq('class_session_id', publicClassId);

  if (error) {
    console.error('Error loading public roster:', error);
    return getDefaultAppState();
  }

  if (!rosterData || rosterData.length === 0) {
    console.log('No roster data found for theme:', publicThemeName, 'class:', publicClassId);

    // Load theme details anyway so UI doesn't break
    const { data: themeData } = await supabase
      .from('themes')
      .select('id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5')
      .eq('name', publicThemeName)
      .single();

    if (themeData) {
      const theme: Theme = {
        name: themeData.name,
        challenges: [
          themeData.challenge_1,
          themeData.challenge_2,
          themeData.challenge_3,
          themeData.challenge_4,
          themeData.challenge_5
        ],
        classes: [{
          id: publicClassId,
          name: DEFAULT_CLASSES.find(c => c.id === publicClassId)?.name || publicClassId,
          students: []
        }]
      };

      return {
        themes: [theme],
        currentWeekTheme: publicThemeName,
        publicThemeName,
        publicClassId,
        selectedClassId: publicClassId,
        progress: {}
      };
    }

    return getDefaultAppState();
  }

  // 3. Get theme details (without images)
  const firstRow = rosterData[0] as RosterViewRow;
  const { data: themeData } = await supabase
    .from('themes')
    .select('id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5')
    .eq('id', firstRow.theme_id)
    .single();

  if (!themeData) {
    console.error('Theme not found for ID:', firstRow.theme_id);
    return getDefaultAppState();
  }

  // 4. Build students array (deduplicate by student_id)
  const studentMap = new Map<string, Student>();
  (rosterData as RosterViewRow[]).forEach(row => {
    if (!studentMap.has(row.student_id)) {
      studentMap.set(row.student_id, {
        id: row.student_id,
        name: row.student_name
      });
    }
  });
  const students = Array.from(studentMap.values());

  // 5. Build single theme object
  const theme: Theme = {
    name: themeData.name,
    challenges: [
      themeData.challenge_1,
      themeData.challenge_2,
      themeData.challenge_3,
      themeData.challenge_4,
      themeData.challenge_5
    ],
    classes: [
      {
        id: publicClassId,
        name: DEFAULT_CLASSES.find(c => c.id === publicClassId)?.name || publicClassId,
        students
      }
    ]
  };

  // 6. Build progress map
  const progress: Record<string, StudentProgress> = {};
  (rosterData as RosterViewRow[]).forEach(row => {
    const key = `${publicClassId}_${row.student_id}_${publicThemeName}`;
    const challengesCompleted: string[] = [];

    if (row.c1) challengesCompleted.push('c1');
    if (row.c2) challengesCompleted.push('c2');
    if (row.c3) challengesCompleted.push('c3');
    if (row.c4) challengesCompleted.push('c4');
    if (row.c5) challengesCompleted.push('c5');

    progress[key] = {
      studentId: row.student_id,
      studentName: row.student_name,
      challengesCompleted,
      timestamp: row.last_updated ? new Date(row.last_updated).getTime() : 0
    };
  });

  const elapsed = Date.now() - startTime;
  console.log(`✅ Public view state loaded in ${elapsed}ms`);

  return {
    themes: [theme],
    currentWeekTheme: publicThemeName,
    publicThemeName,
    publicClassId,
    selectedClassId: publicClassId,
    progress
  };
};

// =============================================================================
// STUDENT SEARCH WITH DATABASE FILTERING
// =============================================================================

export const loadStudentSearchHistory = async (
  searchFilter?: string
): Promise<HistoryEntry[]> => {
  try {
    // Select only needed columns to reduce egress
    // Limit to 500 rows to prevent excessive egress
    let query = supabase
      .from('v_student_roster')
      .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated, assigned_at')
      .order('last_updated', { ascending: false })
      .limit(500);

    // Apply database-level filtering if search provided
    if (searchFilter && searchFilter.trim()) {
      query = query.ilike('student_name', `%${searchFilter.trim()}%`);
    }

    const { data: progressData, error } = await query;

    if (error) {
      console.error('Error loading student search history:', error);
      return [];
    }

    if (!progressData || progressData.length === 0) {
      return [];
    }

    // Fix N+1: Load all relevant themes once
    const themeIds = [...new Set((progressData as RosterViewRow[]).map(r => r.theme_id))];
    const { data: allThemes } = await supabase
      .from('themes')
      .select('id, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, created_at')
      .in('id', themeIds);

    const themeMap = new Map(allThemes?.map(t => [t.id, t]) || []);

    // Build history entries
    const history: HistoryEntry[] = [];

    for (const row of progressData as RosterViewRow[]) {
      if (!row.last_updated) continue;

      const themeData = themeMap.get(row.theme_id);
      if (!themeData) continue;

      const allChallenges = [
        themeData.challenge_1,
        themeData.challenge_2,
        themeData.challenge_3,
        themeData.challenge_4,
        themeData.challenge_5
      ];

      const completedChallenges: string[] = [];
      if (row.c1) completedChallenges.push(allChallenges[0]);
      if (row.c2) completedChallenges.push(allChallenges[1]);
      if (row.c3) completedChallenges.push(allChallenges[2]);
      if (row.c4) completedChallenges.push(allChallenges[3]);
      if (row.c5) completedChallenges.push(allChallenges[4]);

      const date = new Date(row.last_updated);

      history.push({
        id: `${row.student_id}_${row.theme_id}_${date.toISOString()}`,
        studentName: row.student_name,
        className: row.class_session_name,
        weekName: `Session ${date.toLocaleDateString()}`,
        weekTheme: row.theme_name,
        challenges: completedChallenges,
        allAvailableChallenges: allChallenges,
        date: row.last_updated,
        themeCreatedAt: themeData.created_at || undefined,
      });
    }

    return history;
  } catch (error) {
    console.error('Fatal error loading student search history:', error);
    return [];
  }
};

// =============================================================================
// LAZY LOADING: STUDENT SUMMARIES (names + session counts only)
// =============================================================================

export interface StudentSummary {
  studentId: string;
  studentName: string;
  sessionCount: number;
}

export const loadStudentSummaries = async (): Promise<StudentSummary[]> => {
  try {
    // Fetch only student_id and student_name, then aggregate client-side
    // This is much lighter than loading full history data
    const { data, error } = await supabase
      .from('v_student_roster')
      .select('student_id, student_name')
      .limit(2000);

    if (error) {
      console.error('Error loading student summaries:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Aggregate by student to get session counts
    const studentMap = new Map<string, { name: string; count: number }>();

    for (const row of data) {
      const existing = studentMap.get(row.student_id);
      if (existing) {
        existing.count++;
      } else {
        studentMap.set(row.student_id, { name: row.student_name, count: 1 });
      }
    }

    // Convert to array and sort by name
    const summaries: StudentSummary[] = Array.from(studentMap.entries())
      .map(([studentId, { name, count }]) => ({
        studentId,
        studentName: name,
        sessionCount: count,
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));

    console.log(`📋 Loaded ${summaries.length} student summaries (lightweight)`);
    return summaries;
  } catch (error) {
    console.error('Fatal error loading student summaries:', error);
    return [];
  }
};

// =============================================================================
// LAZY LOADING: SINGLE STUDENT HISTORY
// =============================================================================

export const loadStudentHistoryById = async (studentId: string): Promise<HistoryEntry[]> => {
  try {
    console.log(`📖 Loading history for student: ${studentId}`);

    // Fetch only this student's data
    const { data: progressData, error } = await supabase
      .from('v_student_roster')
      .select('student_id, student_name, theme_id, theme_name, class_session_id, class_session_name, c1, c2, c3, c4, c5, last_updated, assigned_at')
      .eq('student_id', studentId)
      .order('last_updated', { ascending: false });

    if (error) {
      console.error('Error loading student history:', error);
      return [];
    }

    if (!progressData || progressData.length === 0) {
      return [];
    }

    // Load theme data for challenge names
    const themeIds = [...new Set((progressData as RosterViewRow[]).map(r => r.theme_id))];
    const { data: allThemes } = await supabase
      .from('themes')
      .select('id, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, created_at')
      .in('id', themeIds);

    const themeMap = new Map(allThemes?.map(t => [t.id, t]) || []);

    // Build history entries
    const history: HistoryEntry[] = [];

    for (const row of progressData as RosterViewRow[]) {
      if (!row.last_updated) continue;

      const themeData = themeMap.get(row.theme_id);
      if (!themeData) continue;

      const allChallenges = [
        themeData.challenge_1,
        themeData.challenge_2,
        themeData.challenge_3,
        themeData.challenge_4,
        themeData.challenge_5
      ];

      const completedChallenges: string[] = [];
      if (row.c1) completedChallenges.push(allChallenges[0]);
      if (row.c2) completedChallenges.push(allChallenges[1]);
      if (row.c3) completedChallenges.push(allChallenges[2]);
      if (row.c4) completedChallenges.push(allChallenges[3]);
      if (row.c5) completedChallenges.push(allChallenges[4]);

      const date = new Date(row.last_updated);

      history.push({
        id: `${row.student_id}_${row.theme_id}_${date.toISOString()}`,
        studentName: row.student_name,
        className: row.class_session_name,
        weekName: `Session ${date.toLocaleDateString()}`,
        weekTheme: row.theme_name,
        challenges: completedChallenges,
        allAvailableChallenges: allChallenges,
        date: row.last_updated,
        themeCreatedAt: themeData.created_at || undefined,
      });
    }

    console.log(`✅ Loaded ${history.length} history entries for student`);
    return history;
  } catch (error) {
    console.error('Fatal error loading student history:', error);
    return [];
  }
};

// =============================================================================
// UPDATE PUBLIC SETTINGS
// =============================================================================

export const updatePublicSettings = async (
  publicThemeName?: string,
  publicClassId?: string
): Promise<void> => {
  const updates = [];

  if (publicThemeName !== undefined) {
    updates.push(setAppSetting('public_theme_id', publicThemeName));
  }

  if (publicClassId !== undefined) {
    updates.push(setAppSetting('public_class_id', publicClassId));
  }

  await Promise.all(updates);
};

// =============================================================================
// UPDATE STUDENT PROGRESS (IMMEDIATE SAVE)
// =============================================================================

export const updateStudentProgress = async (
  classId: string,
  studentId: string,
  themeName: string,
  challengesCompleted: string[]
): Promise<void> => {
  try {
    console.log('Dashboard: Saving progress immediately...', { studentId, themeName, challengesCompleted });

    // Get theme_id from theme name
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('id')
      .eq('name', themeName)
      .single();

    if (themeError || !themeData) {
      console.error('Dashboard: Error fetching theme:', themeError);
      throw new Error('Failed to fetch theme');
    }

    // Convert challenge IDs (c1, c2, etc.) to boolean columns with correct column names
    const progressData = {
      student_id: studentId,
      theme_id: themeData.id,
      class_session_id: classId,
      challenge_1_completed: challengesCompleted.includes('c1'),
      challenge_2_completed: challengesCompleted.includes('c2'),
      challenge_3_completed: challengesCompleted.includes('c3'),
      challenge_4_completed: challengesCompleted.includes('c4'),
      challenge_5_completed: challengesCompleted.includes('c5'),
      last_updated: new Date().toISOString()
    };

    // Upsert progress record with correct conflict key (student_id,theme_id only)
    const { error } = await supabase
      .from('student_progress')
      .upsert(progressData, {
        onConflict: 'student_id,theme_id'
      });

    if (error) {
      console.error('Dashboard: Error updating student progress:', error);
      throw error;
    }

    console.log('Dashboard: Progress saved successfully');
  } catch (error) {
    console.error('Dashboard: Fatal error updating student progress:', error);
    throw error;
  }
};

// =============================================================================
// UPDATE THEME CATEGORY
// =============================================================================

export const updateThemeCategory = async (
  themeName: string,
  category: ThemeCategory | null
): Promise<void> => {
  try {
    console.log(`📝 Updating theme category: ${themeName} -> ${category}`);

    const { error } = await supabase
      .from('themes')
      .update({
        category: category,
        updated_at: new Date().toISOString()
      })
      .eq('name', themeName);

    if (error) {
      console.error('Error updating theme category:', error);
      throw error;
    }

    console.log(`✅ Theme category updated: ${themeName} -> ${category}`);
  } catch (error) {
    console.error('Fatal error updating theme category:', error);
    throw error;
  }
};

// =============================================================================
// GET ALL STUDENTS FROM DATABASE
// =============================================================================

export const getAllStudentsFromDB = async (): Promise<Student[]> => {
  try {
    const { data: studentsData, error } = await supabase
      .from('students')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      console.error('✗ Error loading all students:', error);
      return [];
    }

    return (studentsData || []).map((s: StudentRow) => ({
      id: s.id,
      name: s.name,
    }));
  } catch (error) {
    console.error('✗ Error loading all students:', error);
    return [];
  }
};

// =============================================================================
// DELETE FUNCTIONS
// =============================================================================

export const deleteStudent = async (studentId: string): Promise<void> => {
  try {
    console.log(`🗑️  Deleting student ${studentId}...`);

    // Delete student progress records
    const { error: progressError } = await supabase
      .from('student_progress')
      .delete()
      .eq('student_id', studentId);

    if (progressError) {
      console.error('Error deleting student progress:', progressError);
      throw progressError;
    }

    // Delete student assignments
    const { error: assignmentsError } = await supabase
      .from('student_assignments')
      .delete()
      .eq('student_id', studentId);

    if (assignmentsError) {
      console.error('Error deleting student assignments:', assignmentsError);
      throw assignmentsError;
    }

    // Delete the student
    const { error: studentError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (studentError) {
      console.error('Error deleting student:', studentError);
      throw studentError;
    }

    console.log(`✅ Student ${studentId} deleted successfully`);
  } catch (error) {
    console.error('Fatal error deleting student:', error);
    throw error;
  }
};

export const deleteTheme = async (themeName: string): Promise<void> => {
  try {
    console.log(`🗑️  Deleting theme ${themeName}...`);

    // Get theme ID
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('id')
      .eq('name', themeName)
      .single();

    if (themeError || !themeData) {
      console.error('Error finding theme:', themeError);
      throw themeError || new Error('Theme not found');
    }

    const themeId = themeData.id;

    // Delete student progress for this theme
    const { error: progressError } = await supabase
      .from('student_progress')
      .delete()
      .eq('theme_id', themeId);

    if (progressError) {
      console.error('Error deleting theme progress:', progressError);
      throw progressError;
    }

    // Delete student assignments for this theme
    const { error: assignmentsError } = await supabase
      .from('student_assignments')
      .delete()
      .eq('theme_id', themeId);

    if (assignmentsError) {
      console.error('Error deleting theme assignments:', assignmentsError);
      throw assignmentsError;
    }

    // Delete the theme
    const { error: deleteError } = await supabase
      .from('themes')
      .delete()
      .eq('id', themeId);

    if (deleteError) {
      console.error('Error deleting theme:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Theme ${themeName} deleted successfully`);
  } catch (error) {
    console.error('Fatal error deleting theme:', error);
    throw error;
  }
};

// =============================================================================
// STUDENT ATTRIBUTES (Lazy Loading)
// =============================================================================

export interface StudentAttributesRow {
  id: string;
  student_id: string;
  competitiveness: number;
  independence: number;
  teamwork: number;
  performance: number;
  coachability: number;
  comments: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Load attributes for a single student (lazy loading)
 * Only called when a student profile is selected
 */
export const loadStudentAttributes = async (studentId: string): Promise<StudentAttributesRow | null> => {
  try {
    console.log(`📋 Loading attributes for student: ${studentId}`);

    const { data, error } = await supabase
      .from('student_attributes')
      .select('id, student_id, competitiveness, independence, teamwork, performance, coachability, comments, created_at, updated_at')
      .eq('student_id', studentId)
      .single();

    if (error) {
      // PGRST116 means no rows found - return null (student has no attributes yet)
      if (error.code === 'PGRST116') {
        console.log(`ℹ No attributes found for student ${studentId}, will use defaults`);
        return null;
      }
      console.error('Error loading student attributes:', error);
      throw error;
    }

    console.log(`✅ Loaded attributes for student ${studentId}`);
    return data as StudentAttributesRow;
  } catch (error) {
    console.error('Fatal error loading student attributes:', error);
    throw error;
  }
};

/**
 * Save/update attributes for a student
 * Uses upsert to create or update
 */
export const saveStudentAttributes = async (
  studentId: string,
  attributes: {
    competitiveness: number;
    independence: number;
    teamwork: number;
    performance: number;
    coachability: number;
    comments: string;
  }
): Promise<void> => {
  try {
    console.log(`💾 Saving attributes for student: ${studentId}`);

    const { error } = await supabase
      .from('student_attributes')
      .upsert({
        student_id: studentId,
        competitiveness: attributes.competitiveness,
        independence: attributes.independence,
        teamwork: attributes.teamwork,
        performance: attributes.performance,
        coachability: attributes.coachability,
        comments: attributes.comments,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });

    if (error) {
      console.error('Error saving student attributes:', error);
      throw error;
    }

    console.log(`✅ Saved attributes for student ${studentId}`);
  } catch (error) {
    console.error('Fatal error saving student attributes:', error);
    throw error;
  }
};

/**
 * Batch load attributes for ALL students (for scatter plot analytics)
 * Returns a Map keyed by student_id for O(1) lookup
 */
export const loadAllStudentAttributes = async (): Promise<Map<string, StudentAttributesRow>> => {
  try {
    console.log(`📋 Batch loading all student attributes...`);

    const { data, error } = await supabase
      .from('student_attributes')
      .select('id, student_id, competitiveness, independence, teamwork, performance, coachability, comments, created_at, updated_at');

    if (error) {
      console.error('Error batch loading student attributes:', error);
      throw error;
    }

    // Convert to Map for O(1) lookup by student_id
    const attributesMap = new Map<string, StudentAttributesRow>();
    for (const row of data || []) {
      attributesMap.set(row.student_id, row as StudentAttributesRow);
    }

    console.log(`✅ Batch loaded attributes for ${attributesMap.size} students`);
    return attributesMap;
  } catch (error) {
    console.error('Fatal error batch loading student attributes:', error);
    throw error;
  }
};

// =============================================================================
// BACKUP & RESTORE
// =============================================================================

export const exportProgressBackup = async (): Promise<ProgressBackupData> => {
  console.log('📦 Exporting progress backup...');

  const [{ data: themeRows }, { data: progressRows }] = await Promise.all([
    supabase.from('themes').select('id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5, category'),
    supabase.from('student_progress').select('student_id, theme_id, class_session_id, challenge_1_completed, challenge_2_completed, challenge_3_completed, challenge_4_completed, challenge_5_completed, last_updated, students(name), themes(name)'),
  ]);

  // Build theme id→row map
  const themeMap = new Map<string, any>();
  for (const t of themeRows || []) themeMap.set(t.id, t);

  // Group progress by theme id
  const byTheme = new Map<string, any[]>();
  for (const p of progressRows || []) {
    const existing = byTheme.get(p.theme_id) || [];
    existing.push(p);
    byTheme.set(p.theme_id, existing);
  }

  const themes: ProgressBackupTheme[] = [];
  const studentIdsSeen = new Set<string>();

  for (const [themeId, students] of byTheme) {
    const t = themeMap.get(themeId);
    if (!t) continue;

    themes.push({
      name: t.name,
      category: t.category ?? null,
      challenges: {
        c1: t.challenge_1,
        c2: t.challenge_2,
        c3: t.challenge_3,
        c4: t.challenge_4,
        c5: t.challenge_5,
      },
      students: students.map((p: any) => {
        studentIdsSeen.add(p.student_id);
        return {
          studentId: p.student_id,
          studentName: (p.students as any)?.name ?? '',
          classSessionId: p.class_session_id,
          c1: p.challenge_1_completed ? 1 : 0,
          c2: p.challenge_2_completed ? 1 : 0,
          c3: p.challenge_3_completed ? 1 : 0,
          c4: p.challenge_4_completed ? 1 : 0,
          c5: p.challenge_5_completed ? 1 : 0,
          lastUpdated: p.last_updated,
        };
      }),
    });
  }

  const totalRecords = (progressRows || []).length;
  console.log(`✅ Progress backup built: ${themes.length} themes, ${totalRecords} records`);

  return {
    version: '1.0',
    type: 'progress',
    exportedAt: new Date().toISOString(),
    metadata: {
      themeCount: themes.length,
      studentCount: studentIdsSeen.size,
      recordCount: totalRecords,
    },
    themes,
  };
};

export const restoreProgressBackup = async (
  backup: ProgressBackupData
): Promise<{ restored: number; skipped: number; errors: string[] }> => {
  if (backup.type !== 'progress' || !Array.isArray(backup.themes)) {
    throw new Error('Invalid progress backup file');
  }

  console.log('♻️  Restoring progress backup...');
  const errors: string[] = [];
  let skipped = 0;

  // Re-fetch current theme name → id map
  const { data: dbThemes } = await supabase.from('themes').select('id, name');
  const themeIdMap = new Map<string, string>((dbThemes || []).map((t: any) => [t.name, t.id]));

  const progressRows: any[] = [];

  for (const theme of backup.themes) {
    const themeId = themeIdMap.get(theme.name);
    if (!themeId) {
      console.warn(`  ⚠ Theme not found in DB, skipping: "${theme.name}"`);
      errors.push(`Theme not found, skipped: "${theme.name}"`);
      skipped += theme.students.length;
      continue;
    }

    for (const s of theme.students) {
      progressRows.push({
        student_id: s.studentId,
        theme_id: themeId,
        class_session_id: s.classSessionId,
        challenge_1_completed: s.c1 === 1,
        challenge_2_completed: s.c2 === 1,
        challenge_3_completed: s.c3 === 1,
        challenge_4_completed: s.c4 === 1,
        challenge_5_completed: s.c5 === 1,
        last_updated: s.lastUpdated,
      });
    }
  }

  if (progressRows.length > 0) {
    const { error } = await supabase
      .from('student_progress')
      .upsert(progressRows, { onConflict: 'student_id,theme_id' });

    if (error) {
      console.error('  ✗ Error restoring progress:', error);
      throw error;
    }
  }

  clearStateCache();
  console.log(`✅ Restored ${progressRows.length} progress records (${skipped} skipped)`);
  return { restored: progressRows.length, skipped, errors };
};

export const exportAttributesBackup = async (): Promise<AttributesBackupData> => {
  console.log('📦 Exporting attributes backup...');

  const { data, error } = await supabase
    .from('student_attributes')
    .select('student_id, competitiveness, independence, teamwork, performance, coachability, comments, students(name)');

  if (error) {
    console.error('Error exporting attributes:', error);
    throw error;
  }

  const students = (data || []).map((row: any) => ({
    studentId: row.student_id,
    studentName: (row.students as any)?.name ?? '',
    competitiveness: row.competitiveness,
    independence: row.independence,
    teamwork: row.teamwork,
    performance: row.performance,
    coachability: row.coachability,
    comments: row.comments ?? '',
  }));

  console.log(`✅ Attributes backup built: ${students.length} students`);

  return {
    version: '1.0',
    type: 'attributes',
    exportedAt: new Date().toISOString(),
    metadata: { studentCount: students.length },
    students,
  };
};

export const restoreAttributesBackup = async (
  backup: AttributesBackupData
): Promise<{ restored: number; errors: string[] }> => {
  if (backup.type !== 'attributes' || !Array.isArray(backup.students)) {
    throw new Error('Invalid attributes backup file');
  }

  console.log('♻️  Restoring attributes backup...');

  const rows = backup.students.map(s => ({
    student_id: s.studentId,
    competitiveness: s.competitiveness,
    independence: s.independence,
    teamwork: s.teamwork,
    performance: s.performance,
    coachability: s.coachability,
    comments: s.comments,
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from('student_attributes')
      .upsert(rows, { onConflict: 'student_id' });

    if (error) {
      console.error('  ✗ Error restoring attributes:', error);
      throw error;
    }
  }

  console.log(`✅ Restored ${rows.length} attribute records`);
  return { restored: rows.length, errors: [] };
};

// =============================================================================
// DEFAULT STATE
// =============================================================================

function getDefaultAppState(): AppState {
  return {
    themes: [],
    currentWeekTheme: '',
    publicThemeName: '',
    publicClassId: DEFAULT_CLASSES[0].id,
    selectedClassId: DEFAULT_CLASSES[0].id,
    progress: {},
  };
}
