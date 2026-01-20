import React, { useState, useEffect, useRef } from 'react';
import { AppState, HistoryEntry, StudentProgress } from '../types';
import { loadState, saveState, loadHistory, updateStudentProgress } from '../services/storageService';

const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skipNextAutoSave = useRef(false); // Skip auto-save after immediate progress save

  // Load state and history from database on mount
  useEffect(() => {
    console.log('Dashboard: Starting to load state and history...');
    Promise.all([loadState(), loadHistory()]).then(([loadedState, loadedHistory]) => {
      console.log('Dashboard: ===== DATA LOADED FROM DATABASE =====');
      console.log('Dashboard: Themes:', loadedState.themes.length);
      console.log('Dashboard: Current theme:', loadedState.currentWeekTheme);
      console.log('Dashboard: History entries:', loadedHistory.length);
      console.log('Dashboard: =====================================');

      // Ensure progress exists as an object
      if (!loadedState.progress) {
        loadedState.progress = {};
      }

      setState(loadedState);
      setHistory(loadedHistory);
      setLoading(false);
      isInitialLoad.current = false;
    }).catch(error => {
      console.error('Dashboard: Error loading data:', error);
      setLoading(false);
      isInitialLoad.current = false;
    });
  }, []);

  // Save state to database when it changes (debounced)
  // Skip auto-save when we've just done an immediate progress save to avoid race conditions
  useEffect(() => {
    if (isInitialLoad.current || !state) {
      return;
    }

    // Skip this auto-save if we just did an immediate save
    if (skipNextAutoSave.current) {
      console.log('Dashboard: Skipping auto-save (immediate save already done)');
      skipNextAutoSave.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      console.log('Dashboard: Saving state to database...');
      saveState(state).then(() => {
        console.log('Dashboard: State saved successfully');
      }).catch(error => {
        console.error('Dashboard: Error saving state:', error);
      });
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state]);

  const activeTheme = state?.themes.find(t => t.name === state.currentWeekTheme);
  const realClasses = activeTheme?.classes.filter(c => c.id !== 'unassigned') || [];
  const currentClass = realClasses.find(c => c.id === state?.selectedClassId) || realClasses[0];

  // Get progress for a student from state.progress
  // Search by student_id and theme only, ignoring class_session_id
  const getStudentProgress = (studentName: string, className: string, themeName: string) => {
    if (!state || !currentClass) return { challenges: [], timestamp: 0 };

    const student = currentClass.students.find(s => s.name === studentName);
    if (!student) return { challenges: [], timestamp: 0 };

    // Search for any progress key matching pattern: *_studentId_themeName
    // This handles cases where student was moved between classes
    const progressEntry = Object.entries(state.progress).find(([key]) => {
      const parts = key.split('_');
      if (parts.length < 3) return false;
      const studentId = parts[1];
      const themeNameFromKey = parts.slice(2).join('_');
      return studentId === student.id && themeNameFromKey === themeName;
    });

    if (progressEntry) {
      const progressData = progressEntry[1] as StudentProgress;
      if (progressData && progressData.challengesCompleted) {
        return {
          challenges: progressData.challengesCompleted,
          timestamp: progressData.timestamp || 0
        };
      }
    }

    // Return empty progress if no data exists
    return { challenges: [], timestamp: 0 };
  };

  const toggleChallenge = async (studentName: string, challengeIdx: number) => {
    if (!currentClass || !state || !activeTheme) return;

    const challengeId = `c${challengeIdx + 1}`;
    const student = currentClass.students.find(s => s.name === studentName);
    if (!student) return;

    // Get current progress from state
    const currentProgress = getStudentProgress(studentName, currentClass.name, state.currentWeekTheme);
    const isCompleted = currentProgress.challenges.includes(challengeId);

    const updatedChallenges = isCompleted
      ? currentProgress.challenges.filter(id => id !== challengeId)
      : [...currentProgress.challenges, challengeId];

    console.log('Dashboard: Toggling challenge', {
      studentName,
      challengeId,
      wasCompleted: isCompleted,
      newChallenges: updatedChallenges
    });

    // Set saving status
    setSaveStatus('saving');

    try {
      // Immediately save to database (don't wait for debounced auto-save)
      await updateStudentProgress(
        currentClass.id,
        student.id,
        state.currentWeekTheme,
        updatedChallenges
      );

      // Skip the next auto-save since we just saved immediately
      // This prevents race conditions where debounced save could overwrite
      skipNextAutoSave.current = true;

      // Update state.progress for UI reactivity
      const progressKey = `${currentClass.id}_${student.id}_${state.currentWeekTheme}`;
      setState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          progress: {
            ...prev.progress,
            [progressKey]: {
              studentId: student.id,
              studentName: studentName,
              challengesCompleted: updatedChallenges,
              timestamp: Date.now(),
            }
          }
        };
      });

      // Set saved status
      setSaveStatus('saved');

      // Refresh history after a short delay to show updated progress
      setTimeout(() => {
        loadHistory().then(refreshedHistory => {
          setHistory(refreshedHistory);
        }).catch(error => {
          console.error('Dashboard: Error refreshing history:', error);
        });
      }, 500);
    } catch (error) {
      console.error('Dashboard: Error saving progress:', error);
      setSaveStatus('error');

      // Reset error status after 3 seconds
      setTimeout(() => {
        setSaveStatus('saved');
      }, 3000);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="w-12 h-12 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-black uppercase text-sm text-gray-400">Loading Progress...</p>
      </div>
    );
  }

  if (!state || !activeTheme || !currentClass) {
    return (
      <div className="p-10 text-center">
        <div className="bg-amber-100 border-2 border-amber-400 rounded-sm p-6 inline-block">
          <i className="fas fa-exclamation-triangle text-amber-600 text-2xl mb-3"></i>
          <p className="font-black uppercase text-sm text-amber-900">Session Not Active</p>
          <p className="text-xs text-amber-700 mt-2">
            {!state ? 'Loading...' : !activeTheme ? 'No theme found' : 'No classes available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header - compact on mobile and landscape phone */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-2 landscape-phone:mb-2 sm:mb-8 gap-1 landscape-phone:gap-1 sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            {/* Save Status Indicator */}
            <div className="flex items-center gap-1 sm:gap-2">
              {saveStatus === 'saving' && (
                <>
                  <div className="w-1.5 h-1.5 border border-[#f4c514] border-t-transparent rounded-full animate-spin"></div>
                  <span className="bg-black text-[#f4c514] text-[7px] sm:text-[8px] font-black px-1 sm:px-1.5 py-0.5 rounded-sm tracking-widest uppercase">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  <span className="bg-green-600 text-white text-[7px] sm:text-[8px] font-black px-1 sm:px-1.5 py-0.5 rounded-sm tracking-widest uppercase">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="bg-red-600 text-white text-[7px] sm:text-[8px] font-black px-1 sm:px-1.5 py-0.5 rounded-sm tracking-widest uppercase">Error</span>
                </>
              )}
            </div>
            <select
              value={currentClass.id}
              onChange={(e) => {
                console.log('Dashboard: Switching to class:', e.target.value);
                setState(prev => prev ? ({ ...prev, selectedClassId: e.target.value }) : prev);
              }}
              className="bg-transparent border-b border-black text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-black outline-none cursor-pointer min-w-[100px] sm:min-w-[120px]"
            >
              {realClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.students.length})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 group">
            <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-black tracking-tighter uppercase italic flex items-center">
              <span className="hidden sm:inline">Tracker</span>
              <span className="text-[#f4c514] font-normal not-italic mx-1 sm:mx-2">/</span>
              <span className="relative truncate max-w-[150px] sm:max-w-none">
                {state.currentWeekTheme}
                <select
                  value={state.currentWeekTheme}
                  onChange={(e) => {
                    console.log('Dashboard: Switching to theme:', e.target.value);
                    setState(prev => prev ? ({ ...prev, currentWeekTheme: e.target.value }) : prev);
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  {state.themes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </span>
            </h1>
            <i className="fas fa-chevron-down text-[#f4c514] text-sm sm:text-xl group-hover:translate-y-1 transition-transform cursor-pointer"></i>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 px-4 rounded-sm">
          <div className="text-right">
            <div className="text-[8px] font-black uppercase text-slate-400">Date</div>
            <div className="text-xs font-black uppercase text-black">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          </div>
          <div className="w-8 h-8 bg-[#f4c514] flex items-center justify-center rounded-full shadow-sm">
            <i className="fas fa-cloud text-black text-xs"></i>
          </div>
        </div>
      </div>

      {/* Table container - responsive sizing */}
      <div className="bg-white shadow-xl rounded-sm overflow-hidden border border-slate-100">
        <div className="w-full overflow-x-auto portrait:overflow-y-auto portrait:max-h-[60vh] landscape-phone:overflow-y-auto landscape-phone:max-h-[75vh]">
          <table className="w-full border-collapse table-fixed min-w-[280px]">
            <thead>
              <tr className="bg-[#f4c514] text-black">
                <th className="p-1 landscape-phone:p-0.5 sm:p-3 md:p-4 text-left w-[22%] min-w-[50px] border-r border-black/10">
                  <span className="text-[7px] landscape-phone:text-[7px] sm:text-[10px] uppercase font-black tracking-wider text-black">Student</span>
                </th>
                {activeTheme.challenges.map((chName, i) => (
                  <th key={i} className="p-0.5 landscape-phone:p-0.5 sm:p-3 md:p-4 border-r border-black/10 text-center w-[13%]">
                    <div className="flex flex-col items-center">
                      <span className="text-black font-black text-[8px] landscape-phone:text-[8px] sm:text-xs uppercase tracking-tighter">C{i + 1}</span>
                      <span className="text-[7px] sm:text-[10px] text-black/80 font-bold uppercase truncate max-w-[30px] sm:max-w-[100px] leading-tight hidden sm:block landscape-phone:hidden">{chName}</span>
                    </div>
                  </th>
                ))}
                <th className="p-0.5 landscape-phone:p-0.5 sm:p-3 md:p-4 text-center w-[9%] min-w-[28px]">
                  <span className="text-[6px] landscape-phone:text-[7px] sm:text-[8px] uppercase font-black tracking-widest text-black">%</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentClass.students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    <i className="fas fa-users text-3xl mb-2"></i>
                    <p className="font-black uppercase text-sm">No students in this class</p>
                    <p className="text-xs mt-1">Add students in the Admin panel</p>
                  </td>
                </tr>
              ) : (
                currentClass.students.map((student) => {
                  // Get progress from history instead of state.progress
                  const progress = getStudentProgress(student.name, currentClass.name, state.currentWeekTheme);
                  const completedCount = progress.challenges.length;
                  const percent = (completedCount / 5) * 100;

                  return (
                    <tr key={student.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50 group">
                      <td className="p-0.5 landscape-phone:p-0.5 sm:p-2 md:p-3 border-r border-slate-100">
                        <div className="text-[8px] landscape-phone:text-[7px] sm:text-sm md:text-base font-black text-black uppercase tracking-tight truncate max-w-[60px] sm:max-w-none">
                          {student.name}
                        </div>
                      </td>
                      {[0, 1, 2, 3, 4].map((idx) => {
                        const challengeId = `c${idx + 1}`;
                        const isDone = progress.challenges.includes(challengeId);
                        return (
                          <td
                            key={idx}
                            className="p-0 landscape-phone:p-0 sm:p-1 md:p-2 border-r border-slate-100 text-center cursor-pointer relative overflow-hidden"
                            onClick={() => toggleChallenge(student.name, idx)}
                          >
                            <div className="flex items-center justify-center relative z-10">
                              {isDone ? (
                                <div className="w-4 h-4 landscape-phone:w-4 landscape-phone:h-4 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-[#f4c514] rounded-full flex items-center justify-center shadow-sm animate-in zoom-in duration-300">
                                  <i className="fas fa-check text-black text-[8px] landscape-phone:text-[8px] sm:text-sm md:text-base"></i>
                                </div>
                              ) : (
                                <div className="w-4 h-4 landscape-phone:w-4 landscape-phone:h-4 sm:w-7 sm:h-7 md:w-8 md:h-8 border border-slate-200 rounded-full group-hover:border-[#f4c514]/30 transition-colors"></div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-0.5 landscape-phone:p-0.5 sm:p-2 md:p-3 text-center bg-slate-50/50 font-black text-black text-[8px] landscape-phone:text-[7px] sm:text-[10px]">
                        {Math.round(percent)}%
                        <div className="text-[6px] sm:text-[8px] text-gray-400 font-normal hidden sm:block landscape-phone:hidden">{completedCount}/5</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
        <i className="fas fa-history text-[9px]"></i>
        <span className="text-[8px] font-black uppercase tracking-widest">Auto-archive enabled: Records are saved immediately.</span>
      </div>
    </div>
  );
};

export default Dashboard;