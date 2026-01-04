
import React, { useState, useMemo } from 'react';
import { loadHistory } from '../services/storageService';
import { HistoryEntry } from '../types';

const StudentSearch: React.FC = () => {
  const [history] = useState<HistoryEntry[]>(loadHistory());
  const [search, setSearch] = useState('');

  const allStudents = useMemo(() => {
    return Array.from(new Set(history.map(h => h.studentName))).sort();
  }, [history]);

  const filteredStudents = useMemo(() => {
    if (!search) return allStudents;
    return allStudents.filter(name =>
      name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, allStudents]);

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const studentData = useMemo(() => {
    if (!selectedStudent) return [];
    return history
      .filter(h => h.studentName === selectedStudent)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedStudent, history]);

  const stats = useMemo(() => {
    if (studentData.length === 0) return null;
    const totalChallenges = studentData.reduce((acc, curr) => acc + curr.challenges.length, 0);
    const sessions = studentData.length;
    const avgChallenges = totalChallenges / sessions;
    const progressPercent = (avgChallenges / 5) * 100;
    return { totalChallenges, sessions, avgChallenges, progressPercent };
  }, [studentData]);

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-500">
      <div className="border-b-2 border-[#f4c514] pb-2 flex items-end justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-[#333] tracking-tighter italic uppercase">Mastery Profiles</h1>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Student achievement data</p>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-[10px] font-black uppercase text-black/20 tracking-tighter">Total Students:</span>
          <span className="ml-2 text-sm font-black text-[#f4c514]">{allStudents.length}</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Search Column */}
        <div className="w-full lg:w-1/3 space-y-4">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              type="text"
              placeholder="Filter names..."
              className="w-full bg-[#fff1d1] border border-[#f4c514] p-3 pl-10 font-bold text-gray-800 focus:outline-none text-sm capitalize placeholder:text-gray-400"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Keep selected student if they still match, otherwise we might want to keep it anyway
              }}
            />
          </div>

          <div className="bg-[#fff1d1] border border-[#ffe5a0] rounded-sm divide-y divide-[#ffe5a0] max-h-[600px] overflow-y-auto shadow-sm custom-scrollbar">
            {filteredStudents.length > 0 ? (
              filteredStudents.map(name => (
                <button
                  key={name}
                  onClick={() => setSelectedStudent(name)}
                  className={`w-full text-left p-3 font-black uppercase text-xs hover:bg-[#f4c514] transition-colors flex items-center justify-between group ${selectedStudent === name ? 'bg-[#f4c514]' : ''}`}
                >
                  <span>{name}</span>
                  <i className={`fas fa-chevron-right text-[10px] transition-transform ${selectedStudent === name ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`}></i>
                </button>
              ))
            ) : (
              <div className="p-12 text-center text-gray-400 italic text-[10px] uppercase tracking-widest">
                No matches found
              </div>
            )}
          </div>
        </div>

        {/* Details Column */}
        <div className="flex-1 space-y-6">
          {selectedStudent ? (
            <div className="animate-in slide-in-from-right-4 duration-300">
              <div className="bg-black p-6 text-white rounded-sm shadow-xl relative overflow-hidden border-b-8 border-[#f4c514]">
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter">{selectedStudent}</h2>
                    <button
                      onClick={() => setSelectedStudent(null)}
                      className="text-white/30 hover:text-[#f4c514] transition-colors"
                    >
                      <i className="fas fa-times text-xl"></i>
                    </button>
                  </div>

                  <div className="mb-6 space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#f4c514]">Completion Average</span>
                      <span className="text-xl font-black">{Math.round(stats?.progressPercent || 0)}%</span>
                    </div>
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#f4c514] transition-all duration-1000 ease-out"
                        style={{ width: `${stats?.progressPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                    <div>
                      <div className="text-[#f4c514] text-xl font-black">{stats?.sessions}</div>
                      <div className="text-[8px] uppercase font-bold text-gray-400 tracking-widest">Sessions logged</div>
                    </div>
                    <div>
                      <div className="text-[#f4c514] text-xl font-black">{stats?.totalChallenges}</div>
                      <div className="text-[8px] uppercase font-bold text-gray-400 tracking-widest">Challenges completed</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest border-l-4 border-[#f4c514] pl-3 italic">Session History</h3>
                <div className="space-y-3">
                  {studentData.map((entry) => {
                    const entryProgress = (entry.challenges.length / 5) * 100;
                    return (
                      <div key={entry.id} className="bg-[#fff1d1] p-5 border border-[#ffe5a0] hover:shadow-md transition-shadow relative group">
                        <div className="space-y-0.5 mb-4">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            {new Date(entry.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
                          </div>
                          <div className="text-xl font-black uppercase flex flex-wrap items-baseline gap-2 leading-none">
                            <span className="text-black">{entry.className}</span>
                            <span className="text-[#f4c514] text-sm font-bold">/ {entry.weekTheme || 'UNCATEGORIZED'}</span>
                          </div>
                        </div>

                        <div className="max-w-md space-y-1.5">
                          <div className="flex justify-between items-end">
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">{entry.challenges.length} OF 5 TASKS COMPLETED</span>
                            <span className="text-[10px] font-black text-black italic">{Math.round(entryProgress)}%</span>
                          </div>
                          <div className="w-full bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-black transition-all duration-1000 ease-in-out"
                              style={{ width: `${entryProgress}%` }}
                            ></div>
                          </div>
                        </div>

                        {entry.challenges.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-black/5">
                            {entry.challenges.map((c, i) => (
                              <span key={i} className="text-[9px] font-black uppercase text-slate-600 bg-white/60 px-2 py-1 border border-black/5 rounded-sm shadow-sm group-hover:border-[#f4c514] transition-colors">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="bg-[#f4c514] p-8 rounded-sm text-black border-l-[12px] border-black shadow-lg">
                <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Student Directory</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Showing all {allStudents.length} profiles recorded in the database</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {allStudents.map(studentName => {
                  const studentSessions = history.filter(h => h.studentName === studentName).length;
                  return (
                    <button
                      key={studentName}
                      onClick={() => setSelectedStudent(studentName)}
                      className="bg-white border-2 border-slate-100 p-5 text-left rounded-sm hover:border-[#f4c514] hover:shadow-xl transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 bg-[#f4c514]/10 -rotate-45 translate-x-8 -translate-y-8 group-hover:bg-[#f4c514]/20 transition-colors"></div>
                      <h4 className="text-lg font-black uppercase italic text-black leading-tight mb-1 truncate">{studentName}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{studentSessions} {studentSessions === 1 ? 'Session' : 'Sessions'}</span>
                        <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                        <span className="text-[9px] font-black uppercase text-[#f4c514] tracking-widest">View Profile</span>
                      </div>
                    </button>
                  )
                })}
                {allStudents.length === 0 && (
                  <div className="col-span-full py-20 text-center border-2 border-dashed border-[#fff1d1] rounded-sm">
                    <i className="fas fa-folder-open text-3xl text-slate-200 mb-3"></i>
                    <p className="text-[10px] font-black uppercase italic text-slate-400 tracking-widest">The database is currently empty</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentSearch;