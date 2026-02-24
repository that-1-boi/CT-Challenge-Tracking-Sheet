import React, { useState, useEffect, useRef } from 'react';
import { AppState, StudentProgress } from '../types';
import { loadPublicViewState, updatePublicSettings, getPublicViewFromCacheSync } from '../services/storageService';
import { DEFAULT_CLASSES } from '../constants';

const LivePublicView: React.FC = () => {
  // Initialize synchronously from localStorage — zero DB calls, zero wait on revisit
  const [state, setState] = useState<AppState | null>(getPublicViewFromCacheSync);
  const [loading, setLoading] = useState<boolean>(() => getPublicViewFromCacheSync() === null);

  // Track user's manual class selection separately
  const userSelectedClassId = useRef<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const loadedState = await loadPublicViewState();
        setState(loadedState);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();

    // Refresh once per day — cache handles normal revisits;
    // this catches admin theme/class changes after the 5-min settings TTL expires
    const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

    const interval = setInterval(async () => {
      try {
        console.log('LivePublicView: Daily refresh triggered');
        const loadedState = await loadPublicViewState();

        // Preserve any manual class selection the user made
        if (userSelectedClassId.current) {
          setState({ ...loadedState, publicClassId: userSelectedClassId.current });
        } else {
          setState(loadedState);
        }
      } catch (error) {
        console.error('Error refreshing state:', error);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleClassChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;

    // Store user's selection in ref
    userSelectedClassId.current = newClassId;

    // Show loading state
    setLoading(true);

    try {
      // Update public settings in database
      await updatePublicSettings(undefined, newClassId);

      // Load new class data
      const loadedState = await loadPublicViewState();
      setState(loadedState);

      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error changing class:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get progress for a student from state.progress
  // Search by student_id and theme only, ignoring class_session_id
  const getStudentProgress = (studentName: string, className: string, themeName: string) => {
    if (!state) return { challenges: [], timestamp: 0 };

    const activeTheme = state.themes.find(t => t.name === themeName);
    if (!activeTheme) return { challenges: [], timestamp: 0 };

    const classSession = activeTheme.classes.find(c => c.name === className);
    if (!classSession) return { challenges: [], timestamp: 0 };

    const student = classSession.students.find(s => s.name === studentName);
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

  if (loading || !state) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 font-black uppercase italic tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    );
  }

  const activeTheme = state.themes.find(t => t.name === state.publicThemeName) || state.themes[0];
  const currentClass = activeTheme?.classes.find(c => c.id === state.publicClassId) ||
    activeTheme?.classes.find(c => c.id !== 'unassigned') ||
    activeTheme?.classes[0];

  if (!activeTheme || !currentClass) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 font-black uppercase italic tracking-widest text-xs">Waiting for active session...</p>
        </div>
      </div>
    );
  }

  // Show all available classes from DEFAULT_CLASSES, not just those with students
  const availableClasses = DEFAULT_CLASSES.filter(c => c.id !== 'unassigned');

  return (
    <div className="w-full max-w-[1400px] mx-auto px-1 sm:px-4 md:px-8 animate-in fade-in duration-1000 overflow-hidden">
      {/* Header - responsive and compact on landscape phones */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-2 landscape-phone:mb-1 sm:mb-6 gap-1 landscape-phone:gap-1 sm:gap-4 border-b-2 sm:border-b-4 border-black pb-1 landscape-phone:pb-1 sm:pb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-0.5 landscape-phone:hidden sm:flex">
            <span className="bg-red-600 text-white text-[7px] sm:text-[8px] font-black px-1 sm:px-1.5 py-0.5 rounded-sm animate-pulse tracking-widest uppercase shadow-sm">Live</span>
            <span className="text-black font-bold text-[9px] sm:text-[10px] uppercase tracking-widest">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-1 sm:gap-2 group">
            <div className="relative flex items-center">
              <select
                value={state.publicClassId}
                onChange={handleClassChange}
                className="text-base landscape-phone:text-sm sm:text-4xl md:text-5xl lg:text-6xl font-black text-black tracking-tighter uppercase italic leading-none appearance-none bg-transparent border-none outline-none cursor-pointer hover:text-[#f4c514] transition-colors pr-4 landscape-phone:pr-4 sm:pr-12 z-10 min-w-[100px] landscape-phone:min-w-[100px] sm:min-w-[280px] md:min-w-[400px]"
              >
                {availableClasses.map(c => <option key={c.id} value={c.id} className="text-xs sm:text-lg italic font-black bg-white">{c.name}</option>)}
              </select>
              <i className="fas fa-caret-down text-sm landscape-phone:text-xs sm:text-2xl text-black/20 absolute right-0 sm:right-2 bottom-0 sm:bottom-1 pointer-events-none group-hover:text-[#f4c514]/50"></i>
            </div>

            <div className="flex items-baseline gap-0.5 sm:gap-2">
              <span className="text-[#f4c514] text-base landscape-phone:text-sm sm:text-4xl md:text-6xl font-normal not-italic">/</span>
              <h2 className="text-sm landscape-phone:text-xs sm:text-3xl md:text-5xl lg:text-6xl font-black text-black tracking-tighter uppercase italic leading-none opacity-100 truncate max-w-[80px] landscape-phone:max-w-[80px] sm:max-w-none">
                {state.publicThemeName}
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* Table container - responsive sizing */}
      <div className="bg-white shadow-2xl rounded-sm overflow-hidden border border-black/5">
        <div className="w-full overflow-x-auto portrait:overflow-y-auto portrait:max-h-[60vh] landscape-phone:overflow-y-auto landscape-phone:max-h-[75vh]">
          <table className="w-full border-collapse table-fixed min-w-[280px]">
            <thead>
              <tr className="bg-[#f4c514] text-black">
                <th className="p-1 landscape-phone:p-0.5 sm:p-3 md:p-4 text-left w-[22%] min-w-[50px] border-r border-black/10">
                  <span className="text-[7px] landscape-phone:text-[7px] sm:text-[10px] uppercase font-black tracking-wider text-black">Student</span>
                </th>
                {activeTheme.challenges.map((chName, i) => (
                  <th
                    key={i}
                    className="p-0.5 landscape-phone:p-0.5 sm:p-3 md:p-4 border-r border-black/10 text-center w-[13%]"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-black font-black text-[8px] landscape-phone:text-[8px] sm:text-base uppercase tracking-tighter">C{i + 1}</span>
                      <span className="text-[7px] sm:text-[11px] text-black font-bold uppercase truncate max-w-[30px] sm:max-w-[110px] leading-tight opacity-90 hidden sm:block landscape-phone:hidden">{chName}</span>
                    </div>
                  </th>
                ))}
                <th className="p-0.5 landscape-phone:p-0.5 sm:p-3 md:p-4 text-center w-[9%] min-w-[28px]">
                  <span className="text-[6px] landscape-phone:text-[7px] sm:text-[8px] uppercase font-black tracking-widest text-black">%</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentClass.students.map((student) => {
                // Get progress from history instead of state.progress
                const progress = getStudentProgress(student.name, currentClass.name, state.publicThemeName);
                const completedCount = progress.challenges.length;
                const percent = (completedCount / 5) * 100;

                return (
                  <tr key={student.id} className="border-b border-slate-100 landscape-phone:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="p-0.5 landscape-phone:py-0.5 landscape-phone:px-1 sm:p-3 md:p-4 border-r border-slate-100 text-[8px] landscape-phone:text-[7px] landscape-phone:leading-tight sm:text-lg md:text-xl font-black text-black uppercase tracking-tighter italic truncate max-w-[60px] sm:max-w-none">{student.name}</td>
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const challengeId = `c${idx + 1}`;
                      const isDone = progress.challenges.includes(challengeId);
                      return (
                        <td key={idx} className="p-0 landscape-phone:py-0.5 sm:p-2 border-r border-slate-100 text-center">
                          <div className="flex items-center justify-center">
                            {isDone ? (
                              <div className="w-4 h-4 landscape-phone:w-3 landscape-phone:h-3 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-[#f4c514] rounded-full flex items-center justify-center shadow-md animate-in zoom-in duration-500">
                                <i className="fas fa-check text-black text-[8px] landscape-phone:text-[6px] sm:text-lg md:text-xl"></i>
                              </div>
                            ) : (
                              <div className="w-4 h-4 landscape-phone:w-3 landscape-phone:h-3 sm:w-8 sm:h-8 md:w-10 md:h-10 border-2 border-slate-100 rounded-full bg-slate-50/20"></div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-0.5 landscape-phone:py-0.5 sm:p-3 md:p-4 text-center bg-slate-50/30">
                      <div className="text-[8px] landscape-phone:text-[7px] landscape-phone:leading-tight sm:text-sm font-black text-black leading-none">{Math.round(percent)}%</div>
                      <div className="w-full bg-slate-200 h-0.5 sm:h-1 mt-0.5 sm:mt-1 rounded-full overflow-hidden hidden sm:block landscape-phone:hidden">
                        <div
                          className="bg-[#f4c514] h-full transition-all duration-1000 ease-out"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {currentClass.students.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 sm:p-16 text-center">
                    <p className="text-sm sm:text-xl font-black text-slate-300 uppercase italic tracking-tighter">No active roster</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer - responsive */}
      <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-between items-center text-slate-400 gap-1 sm:gap-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-600 rounded-full animate-pulse"></div>
          <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest">Real-time Cloud Sync</span>
        </div>
        <div className="text-[6px] sm:text-[8px] font-black uppercase tracking-[0.2em]">Cautiontape Challenge Tracking &copy; 2025</div>
      </div>
    </div>
  );
};

export default LivePublicView;