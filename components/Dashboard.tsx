import React, { useState, useEffect, useRef } from 'react';
import { AppState, HistoryEntry } from '../types';
import { loadState, saveState, loadHistory, saveHistory } from '../services/storageService';

const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  useEffect(() => {
    if (isInitialLoad.current || !state) {
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

  // Get progress for a student from history (most recent entry for today)
  const getStudentProgress = (studentName: string, className: string, themeName: string) => {
    if (!history || history.length === 0) return { challenges: [], timestamp: 0 };

    const today = new Date().toISOString().split('T')[0];

    // Find the most recent entry for this student, class, and theme from today
    const studentEntries = history.filter(h =>
      h.studentName === studentName &&
      h.className === className &&
      h.weekTheme === themeName &&
      h.date.startsWith(today)
    );

    if (studentEntries.length === 0) return { challenges: [], timestamp: 0 };

    // Get the most recent entry
    const mostRecent = studentEntries.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

    // Convert challenge names back to IDs (c1, c2, etc.)
    const challengeIds = mostRecent.challenges.map(challengeName => {
      const idx = activeTheme?.challenges.indexOf(challengeName);
      return idx !== -1 && idx !== undefined ? `c${idx + 1}` : null;
    }).filter(Boolean) as string[];

    return {
      challenges: challengeIds,
      timestamp: new Date(mostRecent.date).getTime()
    };
  };

  const syncToHistory = (studentName: string, updatedChallengeIds: string[]) => {
    if (!currentClass || !activeTheme || !state) return;

    loadHistory().then(loadedHistory => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      // Convert challenge IDs to names
      const challengeNames = updatedChallengeIds.map(cid => {
        const idx = parseInt(cid.substring(1)) - 1;
        return activeTheme.challenges[idx] || cid;
      });

      const existingEntryIdx = loadedHistory.findIndex(h =>
        h.studentName === studentName &&
        h.className === currentClass.name &&
        h.weekTheme === state.currentWeekTheme &&
        h.date.startsWith(todayStr)
      );

      let newHistory = [...loadedHistory];

      if (existingEntryIdx !== -1) {
        // Update existing entry
        newHistory[existingEntryIdx] = {
          ...newHistory[existingEntryIdx],
          challenges: challengeNames,
          allAvailableChallenges: activeTheme.challenges,
          date: now.toISOString()
        };
      } else {
        // Create new entry
        const newEntry: HistoryEntry = {
          id: crypto.randomUUID(),
          studentName: studentName,
          className: currentClass.name,
          weekName: `Session ${now.toLocaleDateString()}`,
          weekTheme: state.currentWeekTheme,
          challenges: challengeNames,
          allAvailableChallenges: activeTheme.challenges,
          date: now.toISOString()
        };
        newHistory.push(newEntry);
      }

      saveHistory(newHistory).then(() => {
        console.log('Dashboard: History saved, reloading...');
        // Reload history to update the UI
        loadHistory().then(refreshedHistory => {
          setHistory(refreshedHistory);
        });
      });
    }).catch(error => {
      console.error('Dashboard: Error syncing to history:', error);
    });
  };

  const toggleChallenge = (studentName: string, challengeIdx: number) => {
    if (!currentClass || !state || !activeTheme) return;

    const challengeId = `c${challengeIdx + 1}`;

    // Get current progress from history
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

    syncToHistory(studentName, updatedChallenges);
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
    <div className="w-full max-w-full animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <span className="bg-black text-[#f4c514] text-[8px] font-black px-1.5 py-0.5 rounded-sm tracking-widest uppercase">Sync Active</span>
            </div>
            <select
              value={currentClass.id}
              onChange={(e) => {
                console.log('Dashboard: Switching to class:', e.target.value);
                setState(prev => prev ? ({ ...prev, selectedClassId: e.target.value }) : prev);
              }}
              className="bg-transparent border-b border-black text-[10px] font-bold uppercase tracking-widest text-black outline-none cursor-pointer min-w-[120px]"
            >
              {realClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.students.length})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 group">
            <h1 className="text-3xl md:text-5xl font-black text-black tracking-tighter uppercase italic flex items-center">
              Tracker <span className="text-[#f4c514] font-normal not-italic mx-2">/</span>
              <span className="relative">
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
            <i className="fas fa-chevron-down text-[#f4c514] text-xl group-hover:translate-y-1 transition-transform cursor-pointer"></i>
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

      <div className="bg-white shadow-xl rounded-sm overflow-hidden border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f4c514] text-black">
                <th className="p-3 md:p-4 text-left w-1/4 border-r border-black/10">
                  <span className="text-[10px] uppercase font-black tracking-widest text-black">Student</span>
                </th>
                {activeTheme.challenges.map((chName, i) => (
                  <th key={i} className="p-3 md:p-4 border-r border-black/10 text-center min-w-[110px]">
                    <div className="flex flex-col items-center">
                      <span className="text-black font-black text-xs uppercase tracking-tighter">C{i + 1}</span>
                      <span className="text-[10px] text-black/80 font-bold uppercase truncate max-w-[100px] leading-tight">{chName}</span>
                    </div>
                  </th>
                ))}
                <th className="p-3 md:p-4 text-center w-20">
                  <span className="text-[8px] uppercase font-black tracking-widest text-black">Progress</span>
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
                      <td className="p-2 md:p-3 border-r border-slate-100">
                        <div className="text-sm md:text-base font-black text-black uppercase tracking-tight">
                          {student.name}
                        </div>
                      </td>
                      {[0, 1, 2, 3, 4].map((idx) => {
                        const challengeId = `c${idx + 1}`;
                        const isDone = progress.challenges.includes(challengeId);
                        return (
                          <td
                            key={idx}
                            className="p-1 md:p-2 border-r border-slate-100 text-center cursor-pointer relative overflow-hidden"
                            onClick={() => toggleChallenge(student.name, idx)}
                          >
                            <div className="flex items-center justify-center relative z-10">
                              {isDone ? (
                                <div className="w-7 h-7 md:w-8 md:h-8 bg-[#f4c514] rounded-full flex items-center justify-center shadow-sm animate-in zoom-in duration-300">
                                  <i className="fas fa-check text-black text-sm md:text-base"></i>
                                </div>
                              ) : (
                                <div className="w-7 h-7 md:w-8 md:h-8 border border-slate-200 rounded-full group-hover:border-[#f4c514]/30 transition-colors"></div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-2 md:p-3 text-center bg-slate-50/50 font-black text-black text-[10px]">
                        {Math.round(percent)}%
                        <div className="text-[8px] text-gray-400 font-normal">{completedCount}/5</div>
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