import { supabase } from './supabaseClient';
import { AppState, Theme, StudentProgress, HistoryEntry } from '../types';
import { DEFAULT_CLASSES, DEFAULT_THEMES } from '../constants';

/* =========================================================
   NORMALIZATION (matches old localStorage behavior)
   ========================================================= */

function normalizeAppState(state: AppState): AppState {
  const themes = state.themes.map(theme => {
    const existingIds = new Set(theme.classes.map(c => c.id));
    const missingClasses = DEFAULT_CLASSES
      .filter(dc => !existingIds.has(dc.id))
      .map(dc => ({ ...dc, students: [] }));

    return {
      ...theme,
      classes: [...theme.classes, ...missingClasses],
    };
  });

  const currentWeekTheme = state.currentWeekTheme || themes[0]?.name;

  return {
    themes,
    currentWeekTheme,
    publicThemeName: state.publicThemeName || currentWeekTheme,
    publicClassId: state.publicClassId || DEFAULT_CLASSES[0].id,
    selectedClassId: state.selectedClassId || DEFAULT_CLASSES[0].id,
    progress: state.progress || {},
  };
}

function getDefaultAppState(): AppState {
  return normalizeAppState({
    themes: JSON.parse(JSON.stringify(DEFAULT_THEMES)),
    currentWeekTheme: DEFAULT_THEMES[0].name,
    publicThemeName: DEFAULT_THEMES[0].name,
    publicClassId: DEFAULT_CLASSES[0].id,
    progress: {},
    selectedClassId: DEFAULT_CLASSES[0].id,
  });
}

/* =========================================================
   APP SETTINGS HELPERS
   ========================================================= */

async function getAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error && error.code !== 'PGRST116') return null;
  return data?.value ?? null;
}

async function setAppSetting(key: string, value: string) {
  await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

/* =========================================================
   LOAD STATE (Supabase → AppState)
   ========================================================= */

async function supabaseToAppState(): Promise<AppState> {
  try {
    const { data: themesData } = await supabase.from('themes').select('*').order('created_at');
    if (!themesData || themesData.length === 0) return getDefaultAppState();

    const { data: classesData } = await supabase.from('class_sessions').select('*');
    const { data: studentsData } = await supabase.from('students').select('*');
    const { data: progressData } = await supabase.from('student_progress').select('*');

    const themes: Theme[] = themesData.map(theme => {
      const classes = (classesData || [])
        .filter(c => c.theme_id === theme.id)
        .map(c => ({
          id: c.id,
          name: c.name,
          students: (studentsData || [])
            .filter(s => s.theme_id === theme.id && s.class_session_id === c.id)
            .map(s => ({ id: s.id, name: s.name })),
        }));

      return {
        name: theme.name,
        challenges: theme.challenges,
        challengeImages: theme.challenge_images || undefined,
        classes,
      };
    });

    const progress: Record<string, StudentProgress> = {};
    (progressData || []).forEach(row => {
      const key = `${row.class_session_id}_${row.student_id}_${row.theme_name}`;
      progress[key] = {
        studentId: row.student_id,
        studentName: row.student_name || '',
        challengesCompleted: row.challenges_completed || [],
        timestamp: new Date(row.timestamp).getTime(),
      };
    });

    const currentWeekTheme = (await getAppSetting('currentWeekTheme')) || themes[0].name;
    const publicThemeName = (await getAppSetting('publicThemeName')) || currentWeekTheme;
    const publicClassId = (await getAppSetting('publicClassId')) || DEFAULT_CLASSES[0].id;
    const selectedClassId = (await getAppSetting('selectedClassId')) || DEFAULT_CLASSES[0].id;

    return normalizeAppState({
      themes,
      currentWeekTheme,
      publicThemeName,
      publicClassId,
      selectedClassId,
      progress,
    });
  } catch (e) {
    console.error('Failed to load AppState from Supabase', e);
    return getDefaultAppState();
  }
}

/* =========================================================
   SAVE STATE (AppState → Supabase)
   ========================================================= */

async function appStateToSupabase(state: AppState): Promise<void> {
  for (const theme of state.themes) {
    const { data: themeRow } = await supabase
      .from('themes')
      .upsert({ name: theme.name, challenges: theme.challenges, challenge_images: theme.challengeImages || null }, { onConflict: 'name' })
      .select('id')
      .single();

    if (!themeRow) continue;

    for (const cls of theme.classes) {
      await supabase
        .from('class_sessions')
        .upsert({ id: cls.id, name: cls.name, theme_id: themeRow.id }, { onConflict: 'theme_id,id' });

      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('theme_id', themeRow.id)
        .eq('class_session_id', cls.id);

      const keepIds = new Set(cls.students.map(s => s.id));
      const toDelete = (existing || []).filter(s => !keepIds.has(s.id)).map(s => s.id);

      if (toDelete.length) {
        await supabase.from('students').delete().in('id', toDelete);
      }

      for (const student of cls.students) {
        await supabase
          .from('students')
          .upsert({ id: student.id, name: student.name, class_session_id: cls.id, theme_id: themeRow.id }, { onConflict: 'id' });
      }
    }
  }

  for (const [key, p] of Object.entries(state.progress)) {
    const [classId, studentId, ...themeParts] = key.split('_');
    const themeName = themeParts.join('_');

    await supabase.from('student_progress').upsert({
      student_id: studentId,
      class_session_id: classId,
      theme_name: themeName,
      challenges_completed: p.challengesCompleted,
      timestamp: new Date(p.timestamp).toISOString(),
    }, { onConflict: 'student_id,class_session_id,theme_name' });
  }

  await setAppSetting('currentWeekTheme', state.currentWeekTheme);
  await setAppSetting('publicThemeName', state.publicThemeName);
  await setAppSetting('publicClassId', state.publicClassId);
  await setAppSetting('selectedClassId', state.selectedClassId);
}

/* =========================================================
   PUBLIC API (matches localStorage version)
   ========================================================= */

export const loadState = async (): Promise<AppState> => supabaseToAppState();
export const saveState = async (state: AppState): Promise<void> => appStateToSupabase(state);

export const loadHistory = async (): Promise<HistoryEntry[]> => {
  const { data } = await supabase.from('history_entries').select('*').order('created_at', { ascending: false });
  return (data || []).map(row => ({
    id: row.id,
    studentName: row.student_name,
    className: row.class_name,
    weekName: row.week_name || '',
    weekTheme: row.week_theme,
    challenges: row.challenges,
    allAvailableChallenges: row.all_available_challenges,
    date: row.date,
  }));
};

export const saveHistory = async (history: HistoryEntry[]): Promise<void> => {
  await supabase.from('history_entries').delete().neq('id', '');
  if (history.length) {
    await supabase.from('history_entries').insert(history.map(h => ({
      student_name: h.studentName,
      class_name: h.className,
      week_name: h.weekName,
      week_theme: h.weekTheme,
      challenges: h.challenges,
      all_available_challenges: h.allAvailableChallenges,
      date: h.date,
    })));
  }
};