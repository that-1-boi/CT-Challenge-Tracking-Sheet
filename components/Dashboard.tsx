
import React, { useState, useEffect } from 'react';
import { AppState, HistoryEntry } from '../types';
import { loadState, saveState, loadHistory, saveHistory } from '../services/storageService';

const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState>(loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const activeTheme = state.themes.find(t => t.name === state.currentWeekTheme) || state.themes[0];
  const realClasses = activeTheme?.classes.filter(c => c.id !== 'unassigned') || [];
  const currentClass = realClasses.find(c => c.id === state.selectedClassId) || realClasses[0];

  const syncToHistory = (studentId: string, studentName: string, updatedChallenges: string[]) => {
    if (!currentClass || !activeTheme) return;
    
    const history = loadHistory();
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

    saveHistory(newHistory);
  };

  const toggleChallenge = (studentId: string, challengeIdx: number) => {
    if (!currentClass) return;
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

    setState(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        [progressKey]: { ...currentProgress, challengesCompleted: updatedChallenges }
      }
    }));

    syncToHistory(studentId, student.name, updatedChallenges);
  };

  if (!activeTheme || !currentClass) {
    return <div className="p-10 text-center font-black uppercase text-sm">Session not active</div>;
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
                onChange={(e) => setState(prev => ({ ...prev, selectedClassId: e.target.value }))}
                className="bg-transparent border-b border-black text-[10px] font-bold uppercase tracking-widest text-black outline-none cursor-pointer min-w-[120px]"
              >
                {realClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 group">
            <h1 className="text-3xl md:text-5xl font-black text-black tracking-tighter uppercase italic flex items-center">
              Tracker <span className="text-[#f4c514] font-normal not-italic mx-2">/</span> 
              <span className="relative">
                {state.currentWeekTheme}
                <select 
                   value={state.currentWeekTheme}
                   onChange={(e) => setState(prev => ({ ...prev, currentWeekTheme: e.target.value }))}
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
                      <span className="text-black font-black text-xs uppercase tracking-tighter">C{i+1}</span>
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
              {currentClass.students.map((student) => {
                const progKey = `${currentClass.id}_${student.id}_${state.currentWeekTheme}`;
                const prog = state.progress[progKey];
                const completedCount = prog?.challengesCompleted.length || 0;
                const percent = (completedCount / 5) * 100;
                
                return (
                  <tr key={student.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50 group">
                    <td className="p-2 md:p-3 border-r border-slate-100 text-sm md:text-base font-black text-black uppercase tracking-tight whitespace-nowrap">{student.name}</td>
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const isDone = prog?.challengesCompleted.includes(`c${idx+1}`);
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
                    <td className="p-2 md:p-3 text-center bg-slate-50/50 font-black text-black text-[10px]">{Math.round(percent)}%</td>
                  </tr>
                );
              })}
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
