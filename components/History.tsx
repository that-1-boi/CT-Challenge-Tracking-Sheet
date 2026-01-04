
import React, { useState, useEffect } from 'react';
import { loadHistory, saveHistory, loadState, saveState } from '../services/storageService';
import { HistoryEntry, AppState } from '../types';
import * as XLSX from 'xlsx';

const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('All');
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    const loadInitialHistory = async () => {
      try {
        const loadedHistory = await loadHistory();
        setHistory(loadedHistory);
      } catch (error) {
        console.error('Error loading history:', error);
      } finally {
        setLoading(false);
      }
    };
    loadInitialHistory();
  }, []);

  const classes = ['All', ...Array.from(new Set(history.map(h => h.className)))];

  const filteredHistory = history.filter(h => {
    const matchesSearch = h.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || (h.weekTheme && h.weekTheme.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesClass = selectedClass === 'All' || h.className === selectedClass;
    return matchesSearch && matchesClass;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;
    try {
      const updatedHistory = history.map(h => h.id === editingEntry.id ? editingEntry : h);
      setHistory(updatedHistory);
      await saveHistory(updatedHistory);
      const appState: AppState = await loadState();
      const theme = appState.themes.find(t => t.name === editingEntry.weekTheme);
      if (theme) {
        const cls = theme.classes.find(c => c.name === editingEntry.className);
        if (cls) {
          const student = cls.students.find(s => s.name === editingEntry.studentName);
          if (student) {
            const progressKey = `${cls.id}_${student.id}_${theme.name}`;
            const challengesCompletedIds = editingEntry.challenges.map(name => {
              const idx = editingEntry.allAvailableChallenges.indexOf(name);
              return idx !== -1 ? `c${idx + 1}` : null;
            }).filter(id => id !== null) as string[];
            appState.progress[progressKey] = {
              studentId: student.id,
              studentName: student.name,
              challengesCompleted: challengesCompletedIds,
              timestamp: Date.now()
            };
            await saveState(appState);
          }
        }
      }
      setEditingEntry(null);
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  const toggleChallengeInEdit = (challengeName: string) => {
    if (!editingEntry) return;
    const isCompleted = editingEntry.challenges.includes(challengeName);
    const updatedChallenges = isCompleted
      ? editingEntry.challenges.filter(c => c !== challengeName)
      : [...editingEntry.challenges, challengeName];
    setEditingEntry({ ...editingEntry, challenges: updatedChallenges });
  };

  const exportToExcel = () => {
    if (filteredHistory.length === 0) {
      alert("No data to export!");
      return;
    }
    const uniqueThemes = Array.from(new Set(filteredHistory.map(h => h.weekTheme || 'Uncategorized'))).sort();
    const uniqueStudents = Array.from(new Set(filteredHistory.map(h => h.studentName))).sort();
    const exportData = uniqueStudents.map(studentName => {
      const row: any = { 'Student Name': studentName };
      uniqueThemes.forEach(theme => {
        const entries = filteredHistory.filter(h => h.studentName === studentName && (h.weekTheme || 'Uncategorized') === theme);
        if (entries.length > 0) {
          const allChallenges = Array.from(new Set(entries.flatMap(e => e.challenges))).join(', ');
          row[theme] = allChallenges || 'Done';
        } else {
          row[theme] = '';
        }
      });
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Student Mastery Matrix");
    worksheet['!cols'] = [{ wch: 25 }, ...uniqueThemes.map(() => ({ wch: 30 }))];
    XLSX.writeFile(workbook, `Student_Progress_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="w-12 h-12 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <div className="font-black uppercase text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-full overflow-hidden">
      <div className="border-b-2 border-[#f4c514] pb-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-[#333] tracking-tighter italic uppercase">Session History</h1>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Audit archive for all session records</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Student/Theme..."
              className="bg-[#fff1d1] border-b border-[#f4c514] px-3 py-1 text-sm outline-none font-bold text-gray-800 placeholder:text-gray-400 min-w-[150px] capitalize"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="bg-[#fff1d1] border-b border-[#f4c514] px-3 py-1 text-sm outline-none font-bold cursor-pointer"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <button
            onClick={exportToExcel}
            className="bg-black text-[#f4c514] px-4 py-2 rounded-sm font-black uppercase tracking-widest text-[10px] hover:bg-gray-800 transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <i className="fas fa-download"></i>
            Export Excel
          </button>
        </div>
      </div>

      <div className="bg-[#fff1d1] border border-[#ffe5a0] shadow-xl overflow-hidden rounded-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f4c514]">
                <th className="p-3 border border-[#ffe5a0] text-left text-[10px] font-black uppercase tracking-widest text-black w-24">Date</th>
                <th className="p-3 border border-[#ffe5a0] text-left text-[10px] font-black uppercase tracking-widest text-black">Student</th>
                <th className="p-3 border border-[#ffe5a0] text-left text-[10px] font-black uppercase tracking-widest text-black">Class</th>
                <th className="p-3 border border-[#ffe5a0] text-left text-[10px] font-black uppercase tracking-widest text-black">Challenges</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length > 0 ? (
                filteredHistory.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#ffe8b1] transition-colors border-b border-[#ffe5a0]">
                    <td className="p-2 text-[11px] font-bold text-gray-500 whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="p-2 text-base font-black text-gray-800 uppercase">
                      {entry.studentName}
                    </td>
                    <td className="p-2">
                      <div className="text-[10px] font-black text-indigo-600 uppercase leading-none">{entry.className}</div>
                      <div className="text-[8px] font-black text-gray-400 uppercase italic mt-0.5">{entry.weekTheme || 'Uncategorized'}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.challenges.map((c, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-white/40 text-[9px] font-black uppercase border border-[#ffe5a0] rounded-sm text-gray-600">
                            {c}
                          </span>
                        ))}
                        {entry.challenges.length === 0 && <span className="text-[9px] text-gray-400 uppercase italic">N/A</span>}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-400 font-bold uppercase text-[10px] tracking-widest italic">
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default History;
