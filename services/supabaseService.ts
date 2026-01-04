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
    }

    // Fetch all students
    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select('*');

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
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

          return {
            id: cs.id,
            name: cs.name,
            students: classStudents,
          };
        });

      // Ensure all default classes exist
      const themeClassIds = new Set(themeClasses.map(c => c.id));
      const missingClasses = DEFAULT_CLASSES.filter(dc => !themeClassIds.has(dc.id));
      const allClasses = [
        ...themeClasses,
        ...missingClasses.map(c => ({ ...c, students: [] })),
      ];

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
      for (const progRow of progressData) {
        // Find the student to get their name
        const student = (studentsData || []).find((s: StudentRow) => s.id === progRow.student_id);
        if (student) {
          const key = `${progRow.class_session_id}_${progRow.student_id}_${progRow.theme_name}`;
          progress[key] = {
            studentId: progRow.student_id,
            studentName: student.name,
            challengesCompleted: progRow.challenges_completed,
            timestamp: new Date(progRow.timestamp).getTime(),
          };
        }
      }
    }

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
    // 1. Upsert themes
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
      const { data: themeData } = await supabase
        .from('themes')
        .select('id')
        .eq('name', theme.name)
        .single();

      if (!themeData) continue;
      const themeId = themeData.id;

      // 2. Upsert class sessions for this theme
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
          continue;
        }

        // 3. Upsert students for this class session
        // First, delete students that are no longer in the class
        const { data: existingStudents } = await supabase
          .from('students')
          .select('id')
          .eq('theme_id', themeId)
          .eq('class_session_id', classSession.id);

        const existingStudentIds = new Set(existingStudents?.map(s => s.id) || []);
        const currentStudentIds = new Set(classSession.students.map(s => s.id));

        // Delete removed students
        const studentsToDelete = Array.from(existingStudentIds).filter(id => !currentStudentIds.has(id));
        if (studentsToDelete.length > 0) {
          await supabase
            .from('students')
            .delete()
            .in('id', studentsToDelete);
        }

        // Upsert current students
        for (const student of classSession.students) {
          const { error: studentError } = await supabase
            .from('students')
            .upsert(
              {
                id: student.id,
                name: student.name,
                class_session_id: classSession.id,
                theme_id: themeId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'id' }
            );

          if (studentError) {
            console.error(`Error upserting student ${student.id}:`, studentError);
          }
        }
      }
    }

    // 4. Upsert student progress
    for (const [key, progress] of Object.entries(state.progress)) {
      const [classSessionId, studentId, themeName] = key.split('_');
      
      const { error: progressError } = await supabase
        .from('student_progress')
        .upsert(
          {
            student_id: studentId,
            class_session_id: classSessionId,
            theme_name: themeName,
            challenges_completed: progress.challengesCompleted,
            timestamp: new Date(progress.timestamp).toISOString(),
          },
          { onConflict: 'student_id,theme_name' }
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
      // Clear all history if empty
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

    // Delete all existing history entries first
    const { data: allEntries } = await supabase
      .from('history_entries')
      .select('id')
      .limit(10000); // Get all IDs (adjust if you have more than 10k entries)

    if (allEntries && allEntries.length > 0) {
      const idsToDelete = allEntries.map(e => e.id);
      // Delete in batches of 1000 (Supabase limit)
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

    // Insert in batches of 1000 (Supabase limit)
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

