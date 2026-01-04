import React, { useState, useEffect, useRef } from 'react';
import { AppState, HistoryEntry } from '../types';
import { loadState, saveState, loadHistory, saveHistory } from '../services/storageService';

const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousStateRef = useRef<string>('');

  useEffect(() => {
    loadState().then(loadedState => {
      console.log('Dashboard: Loaded state from database', {
        themes: loadedState.themes.length,
        progressKeys: Object.keys(loadedState.progress).length,
        currentTheme: loadedState.currentWeekTheme,
        progress: loadedState.progress
      });
      setState(loadedState);
      setLoading(false);
      // Initialize previous state ref with just the parts we track for saving
      const stateToCompare = {
        progress: loadedState.progress,
        currentWeekTheme: loadedState.currentWeekTheme,
        publicThemeName: loadedState.publicThemeName,
        publicClassId: loadedState.publicClassId,
        selectedClassId: loadedState.selectedClassId,
      };
      previousStateRef.current = JSON.stringify(stateToCompare);
      isInitialLoad.current = false;
    }).catch(error => {
      console.error('Error loading state:', error);
      setLoading(false);
      isInitialLoad.current = false;
    });
  }, []);

  useEffect(() => {
    // Skip saving on initial load
    if (isInitialLoad.current || !state) {
      return;
    }

    // Compare with previous state to avoid unnecessary saves
    // Only compare progress and settings, not the entire state (which includes themes/classes that might change)
    const stateToCompare = {
      currentWeekTheme: state.currentWeekTheme,
      publicThemeName: state.publicThemeName,
      publicClassId: state.publicClassId,
      selectedClassId: state.selectedClassId,
      progress: state.progress,
    };
    const currentStateString = JSON.stringify(stateToCompare);
    if (previousStateRef.current === currentStateString) {
      return;
    }

    // Update previous state ref immediately to prevent re-triggering
    previousStateRef.current = currentStateString;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save operation
    saveTimeoutRef.current = setTimeout(() => {
      console.log('Dashboard: Saving progress to database', {
        progressKeys: Object.keys(state.progress).length,
        progress: state.progress
      });
      saveState(state).then(() => {
        console.log('Dashboard: Successfully saved to database');
        // Update ref after successful save
        previousStateRef.current = JSON.stringify(stateToCompare);
      }).catch(error => {
        console.error('Error saving state:', error);
        // Reset ref on error so it can retry
        previousStateRef.current = '';
      });
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state]);

  // Get the active theme based on currentWeekTheme
  const activeTheme = state?.themes.find(t => t.name === state.currentWeekTheme);

  // Get real classes (excluding unassigned)
  const realClasses = activeTheme?.classes.filter(c => c.id !== 'unassigned') || [];

  // Get current class - use selectedClassId if valid, otherwise use first real class
  const currentClass = realClasses.find(c => c.id === state?.selectedClassId) || realClasses[0];

  const syncToHistory = async (studentId: string, studentName: string, updatedChallenges: string[]) => {
    if (!currentClass || !activeTheme || !state) return;

    try {
      const history = await loadHistory();
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const challengeNames = updatedChallenges.map(cid => {
        const idx = parseInt(cid.substring(1)) - 1;
        return activeTheme.challenges[idx] || cid;
      });

      const existingEntryIdx = history.findIndex(h =>
        h.studentName === studentName &&
        h.className === currentClass.name &&
        h.weekTheme === state.currentWeekTheme &&
        h.date.startsWith(todayStr)
      );

      let newHistory = [...history];

      if (existingEntryIdx !== -1) {
        newHistory[existingEntryIdx] = {
          ...newHistory[existingEntryIdx],
          challenges: challengeNames,
          allAvailableChallenges: activeTheme.challenges
        };
      } else {
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

      await saveHistory(newHistory);
      console.log('Dashboard: Synced to history', { studentName, challenges: challengeNames });
    } catch (error) {
      console.error('Error syncing to history:', error);
    }
  };

  const toggleChallenge = (studentId: string, challengeIdx: number) => {
    if (!currentClass || !state || !activeTheme) return;
    const student = currentClass.students.find(s => s.id === studentId);
    if (!student) return;

    const progressKey = `${currentClass.id}_${studentId}_${state.currentWeekTheme}`;
    const challengeId = `c${challengeIdx + 1}`;

    const currentProgress = state.progress[progressKey] || {
      studentId,
      studentName: student.name,
      challengesCompleted: [],
      timestamp: Date.now()
    };

    const isCompleted = currentProgress.challengesCompleted.includes(challengeId);
    const updatedChallenges = isCompleted
      ? currentProgress.challengesCompleted.filter(id => id !== challengeId)
      : [...currentProgress.challengesCompleted, challengeId];

    console.log('Dashboard: Toggling challenge', {
      progressKey,
      studentName: student.name,
      challengeId,
      isCompleted,
      updatedChallenges
    });

    setState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        progress: {
          ...prev.progress,
          [progressKey]: {
            ...currentProgress,
            challengesCompleted: updatedChallenges,
            timestamp: Date.now()
          }
        }
      };
    });

    syncToHistory(studentId, student.name, updatedChallenges);
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="w-12 h-12 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-black uppercase text-sm text-gray-400">Loading...</p>
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
            {!activeTheme ? 'No theme found' : 'No classes available'}
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
                console.log('Dashboard: Changing class to', e.target.value);
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
                    console.log('Dashboard: Changing theme to', e.target.value);
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

      {/* Debug info - remove in production */}
      {Object.keys(state.progress).length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-sm text-xs">
          <div className="font-bold text-blue-900 mb-1">Debug: Progress Keys Found</div>
          <div className="text-blue-700 space-y-1">
            {Object.keys(state.progress).map(key => (
              <div key={key} className="font-mono text-[10px]">
                {key}: {state.progress[key].challengesCompleted.join(', ') || 'none'}
              </div>
            ))}
          </div>
        </div>
      )}

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
                  const progKey = `${currentClass.id}_${student.id}_${state.currentWeekTheme}`;
                  const prog = state.progress[progKey];
                  const completedCount = prog?.challengesCompleted.length || 0;
                  const percent = (completedCount / 5) * 100;

                  return (
                    <tr key={student.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50 group">
                      <td className="p-2 md:p-3 border-r border-slate-100 text-sm md:text-base font-black text-black uppercase tracking-tight whitespace-nowrap">
                        {student.name}
                        <span className="ml-2 text-[8px] text-gray-400 font-mono">{student.id.slice(0, 8)}</span>
                      </td>
                      {[0, 1, 2, 3, 4].map((idx) => {
                        const challengeId = `c${idx + 1}`;
                        const isDone = prog?.challengesCompleted.includes(challengeId);
                        return (
                          <td
                            key={idx}
                            className="p-1 md:p-2 border-r border-slate-100 text-center cursor-pointer relative overflow-hidden"
                            onClick={() => toggleChallenge(student.id, idx)}
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
                        <div className="text-[8px] text-gray-400 font-mono">{completedCount}/5</div>
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