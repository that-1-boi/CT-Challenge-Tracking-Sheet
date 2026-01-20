import { supabase } from './supabaseClient';
import { AppState, Theme, ClassSession, Student, StudentProgress, HistoryEntry } from '../types';
import { DEFAULT_CLASSES, DEFAULT_THEMES } from '../constants';

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
  challenge_1_image?: string | null;
  challenge_2_image?: string | null;
  challenge_3_image?: string | null;
  challenge_4_image?: string | null;
  challenge_5_image?: string | null;
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
// LOAD STATE FROM DATABASE
// =============================================================================

export const loadState = async (): Promise<AppState> => {
  try {
    console.log('🔄 Loading state from database...');
    const startTime = Date.now();

    // 1. Load all themes
    const { data: themesData, error: themesError } = await supabase
      .from('themes')
      .select('*')
      .order('created_at', { ascending: true });

    if (themesError) {
      console.error('✗ Error loading themes:', themesError);
      return getDefaultAppState();
    }

    if (!themesData || themesData.length === 0) {
      console.log('ℹ No themes in database, using defaults');
      return getDefaultAppState();
    }

    // 2. Load all students
    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select('*')
      .order('name', { ascending: true });

    if (studentsError) {
      console.error('✗ Error loading students:', studentsError);
    }

    // 3. Load all assignments
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from('student_assignments')
      .select('*');

    if (assignmentsError) {
      console.error('✗ Error loading assignments:', assignmentsError);
    }

    // 4. Load all progress
    const { data: progressData, error: progressError } = await supabase
      .from('student_progress')
      .select('*');

    if (progressError) {
      console.error('✗ Error loading progress:', progressError);
    }

    console.log(`✓ Loaded: ${themesData.length} themes, ${studentsData?.length || 0} students, ${assignmentsData?.length || 0} assignments, ${progressData?.length || 0} progress records`);

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
        challengeImages: [
          themeRow.challenge_1_image || '',
          themeRow.challenge_2_image || '',
          themeRow.challenge_3_image || '',
          themeRow.challenge_4_image || '',
          themeRow.challenge_5_image || '',
        ],
        classes,
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
    const currentWeekThemeName = (await getAppSetting('current_week_theme_id')) || themes[0]?.name || DEFAULT_THEMES[0].name;
    const publicThemeName = (await getAppSetting('public_theme_id')) || currentWeekThemeName;
    const publicClassId = (await getAppSetting('public_class_id')) || DEFAULT_CLASSES[0].id;
    const selectedClassId = (await getAppSetting('selected_class_id')) || DEFAULT_CLASSES[0].id;

    const elapsed = Date.now() - startTime;
    console.log(`✅ State loaded in ${elapsed}ms`);

    return {
      themes,
      currentWeekTheme: currentWeekThemeName,
      publicThemeName,
      publicClassId,
      selectedClassId,
      progress,
    };
  } catch (error) {
    console.error('✗ Fatal error loading state:', error);
    return getDefaultAppState();
  }
};

// =============================================================================
// SAVE STATE TO DATABASE
// =============================================================================

export const saveState = async (state: AppState): Promise<void> => {
  try {
    console.log('💾 Saving state to database...');
    const startTime = Date.now();

    // Get theme ID map (name -> id)
    const { data: existingThemes } = await supabase
      .from('themes')
      .select('id, name');

    const themeIdMap = new Map<string, string>();
    (existingThemes || []).forEach((t: any) => themeIdMap.set(t.name, t.id));

    // 1. UPSERT THEMES
    console.log('  📝 Saving themes...');
    for (const theme of state.themes) {
      const themeData: any = {
        name: theme.name,
        challenge_1: theme.challenges[0] || 'Challenge 1',
        challenge_2: theme.challenges[1] || 'Challenge 2',
        challenge_3: theme.challenges[2] || 'Challenge 3',
        challenge_4: theme.challenges[3] || 'Challenge 4',
        challenge_5: theme.challenges[4] || 'Challenge 5',
        challenge_1_image: theme.challengeImages?.[0] || null,
        challenge_2_image: theme.challengeImages?.[1] || null,
        challenge_3_image: theme.challengeImages?.[2] || null,
        challenge_4_image: theme.challengeImages?.[3] || null,
        challenge_5_image: theme.challengeImages?.[4] || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('themes')
        .upsert(themeData, { onConflict: 'name' })
        .select('id, name')
        .single();

      if (error) {
        console.error(`  ✗ Error saving theme ${theme.name}:`, error);
      } else if (data) {
        themeIdMap.set(data.name, data.id);
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

    // Upsert all students (each student exists once)
    for (const student of allStudents.values()) {
      const { error } = await supabase
        .from('students')
        .upsert(
          {
            id: student.id,
            name: student.name,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.error(`  ✗ Error saving student ${student.name}:`, error);
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
          currentAssignments.push({
            student_id: student.id,
            theme_id: themeId,
            class_session_id: classSession.id,
          });
        }
      }
    }

    // Delete old assignments and insert new ones
    const { data: existingAssignments } = await supabase
      .from('student_assignments')
      .select('student_id, theme_id, class_session_id');

    // Find assignments to delete (exist in DB but not in current state)
    const currentKeys = new Set(
      currentAssignments.map(a => `${a.student_id}_${a.theme_id}`)
    );

    const toDelete = (existingAssignments || []).filter(
      (a: any) => !currentKeys.has(`${a.student_id}_${a.theme_id}`)
    );

    for (const assignment of toDelete) {
      await supabase
        .from('student_assignments')
        .delete()
        .eq('student_id', assignment.student_id)
        .eq('theme_id', assignment.theme_id);
    }

    // Upsert current assignments
    for (const assignment of currentAssignments) {
      const { error } = await supabase
        .from('student_assignments')
        .upsert(assignment, { onConflict: 'student_id,theme_id' });

      if (error) {
        console.error('  ✗ Error saving assignment:', error);
      }
    }

    // 4. SAVE STUDENT PROGRESS
    console.log('  ✅ Saving progress...');
    let progressSaved = 0;
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
      const progressData = {
        student_id: studentId,
        theme_id: themeId,
        class_session_id: classSessionId,
        challenge_1_completed: prog.challengesCompleted.includes('c1'),
        challenge_2_completed: prog.challengesCompleted.includes('c2'),
        challenge_3_completed: prog.challengesCompleted.includes('c3'),
        challenge_4_completed: prog.challengesCompleted.includes('c4'),
        challenge_5_completed: prog.challengesCompleted.includes('c5'),
        last_updated: new Date(prog.timestamp || Date.now()).toISOString(),
      };

      const { error } = await supabase
        .from('student_progress')
        .upsert(progressData, { onConflict: 'student_id,theme_id' });

      if (error) {
        console.error(`  ✗ Error saving progress for ${prog.studentName}:`, error);
        progressErrors++;
      } else {
        progressSaved++;
      }
    }

    console.log(`  ✓ Progress: ${progressSaved} saved, ${progressErrors} errors`);

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
    // Generate history from progress data
    const { data: progressData, error } = await supabase
      .from('v_student_roster')
      .select('*')
      .order('last_updated', { ascending: false });

    if (error) {
      console.error('Error loading history:', error);
      return [];
    }

    if (!progressData || progressData.length === 0) {
      return [];
    }

    // Convert roster view to history entries
    const history: HistoryEntry[] = [];

    for (const row of progressData as RosterViewRow[]) {
      if (!row.last_updated) continue; // Skip students with no progress

      const completedChallenges: string[] = [];
      const { data: themeData } = await supabase
        .from('themes')
        .select('challenge_1, challenge_2, challenge_3, challenge_4, challenge_5')
        .eq('id', row.theme_id)
        .single();

      if (!themeData) continue;

      const allChallenges = [
        themeData.challenge_1,
        themeData.challenge_2,
        themeData.challenge_3,
        themeData.challenge_4,
        themeData.challenge_5,
      ];

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
// DEFAULT STATE
// =============================================================================

function getDefaultAppState(): AppState {
  return {
    themes: DEFAULT_THEMES,
    currentWeekTheme: DEFAULT_THEMES[0].name,
    publicThemeName: DEFAULT_THEMES[0].name,
    publicClassId: DEFAULT_CLASSES[0].id,
    selectedClassId: DEFAULT_CLASSES[0].id,
    progress: {},
  };
}
