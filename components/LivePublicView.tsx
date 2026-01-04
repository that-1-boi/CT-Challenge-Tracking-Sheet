import React, { useState, useEffect, useRef } from 'react';
import { AppState, HistoryEntry } from '../types';
import { loadState, saveState, loadHistory } from '../services/storageService';

const LivePublicView: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<{ name: string, image?: string } | null>(null);
  
  // Track user's manual class selection separately
  const userSelectedClassId = useRef<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedState, loadedHistory] = await Promise.all([loadState(), loadHistory()]);
        console.log('LivePublicView: Loaded', loadedHistory.length, 'history entries');
        setState(loadedState);
        setHistory(loadedHistory);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      try {
        const [loadedState, loadedHistory] = await Promise.all([loadState(), loadHistory()]);
        
        // If user has manually selected a class, preserve it
        if (userSelectedClassId.current) {
          setState({
            ...loadedState,
            publicClassId: userSelectedClassId.current
          });
        } else {
          setState(loadedState);
        }
        
        setHistory(loadedHistory);
      } catch (error) {
        console.error('Error polling state:', error);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleClassChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!state) return;
    const newClassId = e.target.value;
    
    // Store user's selection in ref
    userSelectedClassId.current = newClassId;
    
    const newState = { ...state, publicClassId: newClassId };
    setState(newState);
    
    try {
      await saveState(newState);
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error saving state:', error);
    }
  };

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
    const activeTheme = state?.themes.find(t => t.name === themeName);
    const challengeIds = mostRecent.challenges.map(challengeName => {
      const idx = activeTheme?.challenges.indexOf(challengeName);
      return idx !== -1 && idx !== undefined ? `c${idx + 1}` : null;
    }).filter(Boolean) as string[];

    return {
      challenges: challengeIds,
      timestamp: new Date(mostRecent.date).getTime()
    };
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

  const openChallengeDetails = (index: number) => {
    if (!activeTheme) return;
    setSelectedChallenge({
      name: activeTheme.challenges[index],
      image: activeTheme.challengeImages ? activeTheme.challengeImages[index] : undefined
    });
  };

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

  const availableClasses = activeTheme.classes.filter(c => c.id !== 'unassigned');

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 animate-in fade-in duration-1000">
      {/* Challenge Info Modal - Refined sizing and visibility */}
      {selectedChallenge && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setSelectedChallenge(null)}
        >
          <div
            className="bg-white max-w-4xl w-full h-[70vh] md:h-[75vh] rounded-sm overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300 relative flex flex-col border-4 border-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - standard block header above the image */}
            <div className="bg-black p-4 md:p-5 flex items-center justify-between z-10 border-b-4 border-[#f4c514]">
              <div>
                <h3 className="text-xl md:text-3xl font-black uppercase italic tracking-tighter text-[#f4c514] leading-tight">{selectedChallenge.name}</h3>
                <p className="text-[9px] font-black text-white/50 tracking-[0.2em] uppercase mt-1">Challenge Preview</p>
              </div>
              <button
                onClick={() => setSelectedChallenge(null)}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#f4c514] text-black flex items-center justify-center shadow-lg hover:bg-white hover:scale-105 transition-all ml-4"
              >
                <i className="fas fa-times text-xl md:text-2xl"></i>
              </button>
            </div>

            <div className="flex-1 bg-white relative overflow-hidden flex items-center justify-center">
              {selectedChallenge.image ? (
                <div className="w-full h-full p-4 md:p-8 flex items-center justify-center">
                  <img
                    src={selectedChallenge.image}
                    alt={selectedChallenge.name}
                    className="max-w-full max-h-full object-contain drop-shadow-xl"
                  />
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50">
                  <div className="w-16 h-16 bg-slate-100 flex items-center justify-center rounded-full">
                    <i className="fas fa-image text-slate-200 text-3xl"></i>
                  </div>
                  <p className="text-xl font-black uppercase text-slate-300 italic tracking-tighter">No visual available</p>
                </div>
              )}
            </div>

            {/* Bottom Status Bar */}
            <div className="bg-black p-3 flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Visual Display Mode</span>
              </div>
              <button
                onClick={() => setSelectedChallenge(null)}
                className="text-[#f4c514] font-black uppercase tracking-widest text-[9px] hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4 border-b-4 border-black pb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-sm animate-pulse tracking-widest uppercase shadow-sm">Live Broadcast</span>
            <span className="text-black font-bold text-[10px] uppercase tracking-widest">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2 group">
            <div className="relative flex items-center">
              <select
                value={currentClass.id}
                onChange={handleClassChange}
                className="text-4xl md:text-5xl lg:text-6xl font-black text-black tracking-tighter uppercase italic leading-none appearance-none bg-transparent border-none outline-none cursor-pointer hover:text-[#f4c514] transition-colors pr-12 z-10 min-w-[280px] md:min-w-[400px]"
              >
                {availableClasses.map(c => <option key={c.id} value={c.id} className="text-lg italic font-black bg-white">{c.name}</option>)}
              </select>
              <i className="fas fa-caret-down text-2xl text-black/20 absolute right-2 bottom-1 pointer-events-none group-hover:text-[#f4c514]/50"></i>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-[#f4c514] text-4xl md:text-6xl font-normal not-italic">/</span>
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-black text-black tracking-tighter uppercase italic leading-none opacity-100">
                {state.publicThemeName}
              </h2>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-2xl rounded-sm overflow-hidden border border-black/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f4c514] text-black">
                <th className="p-3 md:p-4 text-left w-1/4 border-r border-black/10">
                  <span className="text-[10px] uppercase font-black tracking-widest text-black">Student Name</span>
                </th>
                {activeTheme.challenges.map((chName, i) => (
                  <th
                    key={i}
                    onClick={() => openChallengeDetails(i)}
                    className="p-3 md:p-4 border-r border-black/10 text-center min-w-[120px] cursor-pointer group/header hover:bg-black transition-colors"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-black group-hover/header:text-[#f4c514] font-black text-base uppercase tracking-tighter transition-colors">C{i + 1}</span>
                      <span className="text-[11px] text-black group-hover/header:text-white font-bold uppercase truncate max-w-[110px] leading-tight opacity-90 transition-colors">{chName}</span>
                    </div>
                  </th>
                ))}
                <th className="p-3 md:p-4 text-center w-24">
                  <span className="text-[8px] uppercase font-black tracking-widest text-black">Mastery</span>
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
                  <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 md:p-4 border-r border-slate-100 text-lg md:text-xl font-black text-black uppercase tracking-tighter italic whitespace-nowrap">{student.name}</td>
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const challengeId = `c${idx + 1}`;
                      const isDone = progress.challenges.includes(challengeId);
                      return (
                        <td key={idx} className="p-2 border-r border-slate-100 text-center">
                          <div className="flex items-center justify-center">
                            {isDone ? (
                              <div className="w-8 h-8 md:w-10 md:h-10 bg-[#f4c514] rounded-full flex items-center justify-center shadow-md animate-in zoom-in duration-500">
                                <i className="fas fa-check text-black text-lg md:text-xl"></i>
                              </div>
                            ) : (
                              <div className="w-8 h-8 md:w-10 md:h-10 border-2 border-slate-100 rounded-full bg-slate-50/20"></div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-3 md:p-4 text-center bg-slate-50/30">
                      <div className="text-sm font-black text-black leading-none">{Math.round(percent)}%</div>
                      <div className="w-full bg-slate-200 h-1 mt-1 rounded-full overflow-hidden">
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
                  <td colSpan={7} className="p-16 text-center">
                    <p className="text-xl font-black text-slate-300 uppercase italic tracking-tighter">No active roster</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex justify-between items-center text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
          <span className="text-[8px] font-black uppercase tracking-widest">Real-time Cloud Sync</span>
        </div>
        <div className="text-[8px] font-black uppercase tracking-[0.2em]">Cautiontape Challenge Tracking &copy; 2025</div>
      </div>
    </div>
  );
};

export default LivePublicView;