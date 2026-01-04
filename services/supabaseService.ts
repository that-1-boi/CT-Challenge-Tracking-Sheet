import { supabase } from './supabaseClient';
import { AppState, Theme, ClassSession, Student, StudentProgress, HistoryEntry } from '../types';
import { DEFAULT_CLASSES, DEFAULT_THEMES } from '../constants';

// Database table types
interface ThemeRow {
  id: string;
  name: string;
  challenges: string[];
  challenge_images?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

interface ClassSessionRow {
  id: string;
  name: string;
  theme_id: string;
  created_at?: string;
  updated_at?: string;
}

interface StudentRow {
  id: string;
  class_session_id: string;
  theme_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

interface StudentProgressRow {
  id: string;
  student_id: string;
  class_session_id: string;
  theme_name: string;
  challenges_completed: string[];
  timestamp: string;
  created_at?: string;
}

interface AppSettingRow {
  id: string;
  key: string;
  value: string;
  updated_at?: string;
}

// Helper function to get or set app setting
async function getAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error getting app setting:', error);
    return null;
  }
  return data?.value || null;
}

async function setAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    console.error('Error setting app setting:', error);
  }
}

// Convert database rows to AppState
async function supabaseToAppState(): Promise<AppState> {
  try {
    // Fetch all themes
    const { data: themesData, error: themesError } = await supabase
      .from('themes')
      .select('*')
      .order('created_at', { ascending: true });

    if (themesError) {
      console.error('Error fetching themes:', themesError);
      return getDefaultAppState();
    }

    // If no themes exist, return default state
    if (!themesData || themesData.length === 0) {
      return getDefaultAppState();
    }

    // Fetch all class sessions
    const { data: classSessionsData, error: classSessionsError } = await supabase
      .from('class_sessions')
      .select('*');

    if (classSessionsError) {
      console.error('Error fetching class sessions:', classSessionsError);
    } else {
      console.log(`Loaded ${classSessionsData?.length || 0} class sessions from database`);
    }

    // Fetch all students
    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select('*');

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
    } else {
      console.log(`Loaded ${studentsData?.length || 0} students from database`);
      if (studentsData && studentsData.length > 0) {
        console.log('Sample student:', studentsData[0]);
      }
    }

    // Fetch all student progress
    const { data: progressData, error: progressError } = await supabase
      .from('student_progress')
      .select('*');

    if (progressError) {
      console.error('Error fetching progress:', progressError);
    }

    // Build themes with classes and students
    const themes: Theme[] = themesData.map((themeRow: ThemeRow) => {
      // Get class sessions for this theme
      const themeClasses = (classSessionsData || [])
        .filter((cs: ClassSessionRow) => cs.theme_id === themeRow.id)
        .map((cs: ClassSessionRow) => {
          // Get students for this class session
          const classStudents = (studentsData || [])
            .filter((s: StudentRow) => s.theme_id === themeRow.id && s.class_session_id === cs.id)
            .map((s: StudentRow) => ({
              id: s.id,
              name: s.name,
            }));

          console.log(`Theme ${themeRow.name}, Class ${cs.id} (${cs.name}) has ${classStudents.length} students`);

          return {
            id: cs.id,
            name: cs.name,
            students: classStudents,
          };
        });

      // If no class sessions exist in DB, check if students exist for this theme and create classes for them
      if (themeClasses.length === 0 && studentsData && studentsData.length > 0) {
        const themeStudents = (studentsData || [])
          .filter((s: StudentRow) => s.theme_id === themeRow.id);

        if (themeStudents.length > 0) {
          console.log(`Found ${themeStudents.length} students for theme ${themeRow.name} but no class sessions. Creating default classes.`);
          // Group students by class_session_id
          const studentsByClass = new Map<string, StudentRow[]>();
          themeStudents.forEach(s => {
            if (!studentsByClass.has(s.class_session_id)) {
              studentsByClass.set(s.class_session_id, []);
            }
            studentsByClass.get(s.class_session_id)!.push(s);
          });

          // Create class entries for each class_session_id
          studentsByClass.forEach((students, classSessionId) => {
            const defaultClass = DEFAULT_CLASSES.find(c => c.id === classSessionId);
            themeClasses.push({
              id: classSessionId,
              name: defaultClass?.name || classSessionId,
              students: students.map(s => ({ id: s.id, name: s.name })),
            });
          });
        }
      }

      // Ensure all default classes exist and sort by DEFAULT_CLASSES order
      const themeClassIds = new Set(themeClasses.map(c => c.id));
      const missingClasses = DEFAULT_CLASSES.filter(dc => !themeClassIds.has(dc.id));
      const allClassesWithMissing = [
        ...themeClasses,
        ...missingClasses.map(c => ({ ...c, students: [] })),
      ];

      // Sort classes to match DEFAULT_CLASSES order
      const classOrderMap = new Map(DEFAULT_CLASSES.map((c, idx) => [c.id, idx]));
      const allClasses = allClassesWithMissing.sort((a, b) => {
        const orderA = classOrderMap.get(a.id) ?? 999;
        const orderB = classOrderMap.get(b.id) ?? 999;
        return orderA - orderB;
      });

      console.log(`Theme ${themeRow.name} has ${allClasses.length} classes, ${allClasses.reduce((sum, c) => sum + c.students.length, 0)} total students`);

      return {
        name: themeRow.name,
        challenges: themeRow.challenges,
        challengeImages: themeRow.challenge_images || undefined,
        classes: allClasses,
      };
    });

    // Build progress object
    const progress: Record<string, StudentProgress> = {};
    if (progressData) {
      console.log(`Loading ${progressData.length} progress entries from database`);
      for (const progRow of progressData) {
        // Find the student to get their name
        const student = (studentsData || []).find((s: StudentRow) => s.id === progRow.student_id);
        if (student) {
          // Build key: class_session_id_student_id_theme_name
          // Theme name might contain underscores, so we use the full theme_name from DB
          const key = `${progRow.class_session_id}_${progRow.student_id}_${progRow.theme_name}`;
          progress[key] = {
            studentId: progRow.student_id,
            studentName: student.name,
            challengesCompleted: Array.isArray(progRow.challenges_completed) ? progRow.challenges_completed : [],
            timestamp: new Date(progRow.timestamp).getTime(),
          };
          console.log(`Loaded progress for ${key}: ${progRow.challenges_completed?.length || 0} challenges completed`);
        } else {
          console.warn(`Student ${progRow.student_id} not found for progress entry (class: ${progRow.class_session_id}, theme: ${progRow.theme_name})`);
        }
      }
    } else {
      console.log('No progress data found in database');
    }
    console.log(`Total progress keys loaded: ${Object.keys(progress).length}`);

    // Get app settings
    const currentWeekTheme = (await getAppSetting('currentWeekTheme')) || themes[0]?.name || DEFAULT_THEMES[0].name;
    const publicThemeName = (await getAppSetting('publicThemeName')) || currentWeekTheme;
    const publicClassId = (await getAppSetting('publicClassId')) || DEFAULT_CLASSES[0].id;
    const selectedClassId = (await getAppSetting('selectedClassId')) || DEFAULT_CLASSES[0].id;

    return {
      themes,
      currentWeekTheme,
      publicThemeName,
      publicClassId,
      progress,
      selectedClassId,
    };
  } catch (error) {
    console.error('Error converting Supabase data to AppState:', error);
    return getDefaultAppState();
  }
}

// Convert AppState to database operations
async function appStateToSupabase(state: AppState): Promise<void> {
  try {
    // Collect all students across all themes with their assignments
    const studentAssignments = new Map<string, { name: string; assignments: Array<{ themeId: string; themeName: string; classId: string }> }>();

    for (const theme of state.themes) {
      for (const classSession of theme.classes) {
        for (const student of classSession.students) {
          if (!studentAssignments.has(student.id)) {
            studentAssignments.set(student.id, { name: student.name, assignments: [] });
          }
          studentAssignments.get(student.id)!.assignments.push({
            themeId: '', // Will be filled after we get theme IDs
            themeName: theme.name,
            classId: classSession.id,
          });
        }
      }
    }

    console.log(`Processing ${studentAssignments.size} unique students with assignments`);

    // 1. Upsert themes and get their IDs
    const themeIdMap = new Map<string, string>();
    for (const theme of state.themes) {
      const { error: themeError } = await supabase
        .from('themes')
        .upsert(
          {
            name: theme.name,
            challenges: theme.challenges,
            challenge_images: theme.challengeImages || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'name' }
        );

      if (themeError) {
        console.error(`Error upserting theme ${theme.name}:`, themeError);
        continue;
      }

      // Get theme ID
      const { data: themeData, error: themeDataError } = await supabase
        .from('themes')
        .select('id')
        .eq('name', theme.name)
        .single();

      if (themeDataError || !themeData) {
        console.error(`Error getting theme ID for ${theme.name}:`, themeDataError);
        continue;
      }
      themeIdMap.set(theme.name, themeData.id);
      console.log(`Theme ${theme.name} has ID ${themeData.id}`);
    }

    // Update student assignments with theme IDs
    for (const [studentId, data] of studentAssignments.entries()) {
      data.assignments = data.assignments.map(assignment => ({
        ...assignment,
        themeId: themeIdMap.get(assignment.themeName) || '',
      }));
    }

    // 2. Upsert class sessions for all themes
    for (const theme of state.themes) {
      const themeId = themeIdMap.get(theme.name);
      if (!themeId) continue;

      for (const classSession of theme.classes) {
        const { error: classError } = await supabase
          .from('class_sessions')
          .upsert(
            {
              id: classSession.id,
              name: classSession.name,
              theme_id: themeId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'theme_id,id' }
          );

        if (classError) {
          console.error(`Error upserting class session ${classSession.id}:`, classError);
        }
      }
    }

    // 3. Save all student assignments
    // First, get all existing students from DB
    const { data: existingStudentsInDb } = await supabase
      .from('students')
      .select('id, theme_id, class_session_id');

    const existingStudentKeys = new Set(
      (existingStudentsInDb || []).map(s => `${s.id}_${s.theme_id}_${s.class_session_id}`)
    );

    // Build set of current student assignments
    const currentStudentKeys = new Set<string>();
    const studentsToUpsert: Array<{ id: string; name: string; theme_id: string; class_session_id: string }> = [];

    for (const [studentId, data] of studentAssignments.entries()) {
      for (const assignment of data.assignments) {
        if (!assignment.themeId) continue;

        const key = `${studentId}_${assignment.themeId}_${assignment.classId}`;
        currentStudentKeys.add(key);

        studentsToUpsert.push({
          id: studentId,
          name: data.name,
          theme_id: assignment.themeId,
          class_session_id: assignment.classId,
        });
      }
    }

    // Find assignments that need to be deleted (student moved from one class to another in a theme)
    const assignmentsToDelete: Array<{ studentId: string; themeId: string; classId: string }> = [];
    for (const s of existingStudentsInDb || []) {
      const key = `${s.id}_${s.theme_id}_${s.class_session_id}`;
      if (!currentStudentKeys.has(key)) {
        assignmentsToDelete.push({
          studentId: s.id,
          themeId: s.theme_id,
          classId: s.class_session_id,
        });
      }
    }

    console.log(`Upserting ${studentsToUpsert.length} student assignments`);
    console.log(`Deleting ${assignmentsToDelete.length} old student assignments`);

    // Delete old assignments
    for (const assignment of assignmentsToDelete) {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', assignment.studentId)
        .eq('theme_id', assignment.themeId)
        .eq('class_session_id', assignment.classId);

      if (error) {
        console.error(`Error deleting student assignment:`, error);
      }
    }

    // Upsert all current assignments
    for (const student of studentsToUpsert) {
      const { error: studentError } = await supabase
        .from('students')
        .upsert(
          {
            id: student.id,
            name: student.name,
            class_session_id: student.class_session_id,
            theme_id: student.theme_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id,theme_id,class_session_id' }
        );

      if (studentError) {
        console.error(`Error upserting student ${student.id} to theme ${student.theme_id}, class ${student.class_session_id}:`, studentError);
      }
    }

    // 4. Upsert student progress
    console.log(`Saving ${Object.keys(state.progress).length} progress entries`);
    for (const [key, progress] of Object.entries(state.progress)) {
      const parts = key.split('_');
      if (parts.length < 3) {
        console.warn(`Invalid progress key format: ${key}, expected format: classId_studentId_themeName`);
        continue;
      }

      const classSessionId = parts[0];
      const studentId = parts[1];
      const themeName = parts.slice(2).join('_');

      const { error: progressError } = await supabase
        .from('student_progress')
        .upsert(
          {
            student_id: studentId,
            class_session_id: classSessionId,
            theme_name: themeName,
            challenges_completed: progress.challengesCompleted || [],
            timestamp: new Date(progress.timestamp).toISOString(),
          },
          { onConflict: 'student_id,class_session_id,theme_name' }
        );

      if (progressError) {
        console.error(`Error upserting progress for ${key}:`, progressError);
      }
    }

    // 5. Save app settings
    await setAppSetting('currentWeekTheme', state.currentWeekTheme);
    await setAppSetting('publicThemeName', state.publicThemeName);
    await setAppSetting('publicClassId', state.publicClassId);
    await setAppSetting('selectedClassId', state.selectedClassId);

    console.log('✅ Successfully saved all state to Supabase');
  } catch (error) {
    console.error('Error saving AppState to Supabase:', error);
    throw error;
  }
}

function getDefaultAppState(): AppState {
  return {
    themes: DEFAULT_THEMES,
    currentWeekTheme: DEFAULT_THEMES[0].name,
    publicThemeName: DEFAULT_THEMES[0].name,
    publicClassId: DEFAULT_CLASSES[0].id,
    progress: {},
    selectedClassId: DEFAULT_CLASSES[0].id,
  };
}

// Public API - matches storageService interface
export const loadState = async (): Promise<AppState> => {
  return await supabaseToAppState();
};

export const saveState = async (state: AppState): Promise<void> => {
  await appStateToSupabase(state);
};

export const loadHistory = async (): Promise<HistoryEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('history_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading history:', error);
      return [];
    }

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      studentName: row.student_name,
      className: row.class_name,
      weekName: row.week_name || '',
      weekTheme: row.week_theme,
      challenges: row.challenges,
      allAvailableChallenges: row.all_available_challenges,
      date: row.date,
    }));
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
};

export const saveHistory = async (history: HistoryEntry[]): Promise<void> => {
  try {
    if (history.length === 0) {
      const { data: allEntries } = await supabase
        .from('history_entries')
        .select('id')
        .limit(10000);

      if (allEntries && allEntries.length > 0) {
        const idsToDelete = allEntries.map(e => e.id);
        for (let i = 0; i < idsToDelete.length; i += 1000) {
          const batch = idsToDelete.slice(i, i + 1000);
          await supabase
            .from('history_entries')
            .delete()
            .in('id', batch);
        }
      }
      return;
    }

    const { data: allEntries } = await supabase
      .from('history_entries')
      .select('id')
      .limit(10000);

    if (allEntries && allEntries.length > 0) {
      const idsToDelete = allEntries.map(e => e.id);
      for (let i = 0; i < idsToDelete.length; i += 1000) {
        const batch = idsToDelete.slice(i, i + 1000);
        await supabase
          .from('history_entries')
          .delete()
          .in('id', batch);
      }
    }

    const rows = history.map(entry => ({
      student_name: entry.studentName,
      class_name: entry.className,
      week_name: entry.weekName,
      week_theme: entry.weekTheme,
      challenges: entry.challenges,
      all_available_challenges: entry.allAvailableChallenges,
      date: entry.date,
    }));

    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);
      const { error: insertError } = await supabase
        .from('history_entries')
        .insert(batch);

      if (insertError) {
        console.error('Error saving history batch:', insertError);
      }
    }
  } catch (error) {
    console.error('Error saving history:', error);
  }
};