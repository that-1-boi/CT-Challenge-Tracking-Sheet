
import React, { useState, useEffect, useCallback } from 'react';
import { loadHistoryPaginated, saveHistory, loadState, saveState } from '../services/storageService';
import { HistoryEntry, AppState } from '../types';
import { subscribeSyncEvent, getLastSyncTimestamp } from '../services/syncEvents';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 20;

// Cache history data in localStorage to prevent excessive reads
const HISTORY_CACHE_KEY = 'ct_history_page_cache';
const HISTORY_TIMESTAMP_KEY = 'ct_history_page_cache_timestamp';
const HISTORY_META_KEY = 'ct_history_page_meta';

interface HistoryCacheMeta {
  totalCount: number;
  loadedCount: number;
  hasMore: boolean;
}

function getCachedHistory(): { entries: HistoryEntry[]; meta: HistoryCacheMeta } | null {
  try {
    const cached = localStorage.getItem(HISTORY_CACHE_KEY);
    const timestamp = localStorage.getItem(HISTORY_TIMESTAMP_KEY);
    const metaStr = localStorage.getItem(HISTORY_META_KEY);
    if (!cached || !timestamp || !metaStr) return null;

    const cacheTime = parseInt(timestamp, 10);
    const lastSync = getLastSyncTimestamp();

    // If a sync happened after caching, invalidate
    if (lastSync && lastSync > cacheTime) {
      console.log('History: Cache invalidated by recent sync');
      return null;
    }

    console.log('History: Using cached data');
    return {
      entries: JSON.parse(cached),
      meta: JSON.parse(metaStr)
    };
  } catch {
    return null;
  }
}

function setCachedHistory(entries: HistoryEntry[], meta: HistoryCacheMeta): void {
  try {
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(entries));
    localStorage.setItem(HISTORY_META_KEY, JSON.stringify(meta));
    localStorage.setItem(HISTORY_TIMESTAMP_KEY, Date.now().toString());
    console.log('History: Data cached');
  } catch (error) {
    console.error('Error caching history:', error);
  }
}

function clearHistoryCache(): void {
  localStorage.removeItem(HISTORY_CACHE_KEY);
  localStorage.removeItem(HISTORY_META_KEY);
  localStorage.removeItem(HISTORY_TIMESTAMP_KEY);
}

const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('All');
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);

  // Load initial page - checks cache first
  const loadInitialData = useCallback(async (forceRefresh = false) => {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCachedHistory();
      if (cached) {
        setHistory(cached.entries);
        setHasMore(cached.meta.hasMore);
        setTotalCount(cached.meta.totalCount);
        setLoading(false);
        return;
      }
    }

    // Fetch first page from database
    console.log('History: Loading first page from database...');
    setLoading(true);
    try {
      const result = await loadHistoryPaginated(0, PAGE_SIZE);
      setHistory(result.entries);
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
      setCachedHistory(result.entries, {
        totalCount: result.totalCount,
        loadedCount: result.entries.length,
        hasMore: result.hasMore
      });
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load more entries
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const result = await loadHistoryPaginated(history.length, PAGE_SIZE);
      const newHistory = [...history, ...result.entries];
      setHistory(newHistory);
      setHasMore(result.hasMore);
      setCachedHistory(newHistory, {
        totalCount: result.totalCount,
        loadedCount: newHistory.length,
        hasMore: result.hasMore
      });
    } catch (error) {
      console.error('Error loading more history:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [history, hasMore, loadingMore]);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Listen for sync events to refresh data
  useEffect(() => {
    const unsubscribe = subscribeSyncEvent(() => {
      console.log('History: Sync event received, refreshing data...');
      clearHistoryCache();
      loadInitialData(true); // Force refresh from DB
    });
    return unsubscribe;
  }, [loadInitialData]);

  const classes = ['All', ...Array.from(new Set(history.map(h => h.className)))];

  const filteredHistory = history.filter(h => {
    const matchesSearch = h.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || (h.weekTheme && h.weekTheme.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesClass = selectedClass === 'All' || h.className === selectedClass;
    return matchesSearch && matchesClass;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;
    const updatedHistory = history.map(h => h.id === editingEntry.id ? editingEntry : h);
    setHistory(updatedHistory);
    try {
      await saveHistory(updatedHistory);
      const appState = await loadState();
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
            const updatedState: AppState = {
              ...appState,
              progress: {
                ...appState.progress,
                [progressKey]: {
                  studentId: student.id,
                  studentName: student.name,
                  challengesCompleted: challengesCompletedIds,
                  timestamp: Date.now()
                }
              }
            };
            await saveState(updatedState);
            window.dispatchEvent(new Event('storage'));
          }
        }
      }
    } catch (error) {
      console.error('Error updating entry:', error);
    }
    setEditingEntry(null);
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
    const uniqueThemes = Array.from(new Set<string>(filteredHistory.map(h => h.weekTheme || 'Uncategorized'))).sort();
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
        <p className="font-black uppercase text-sm text-gray-400">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-full overflow-hidden">
      <div className="border-b-2 border-[#f4c514] pb-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-[#333] tracking-tighter italic uppercase">Session History</h1>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
            Showing {history.length} of {totalCount} records
          </p>
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
                  <td colSpan={4} className="p-12 text-center text-gray-400 font-bold uppercase text-[10px] tracking-widest italic">
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Button */}
        {hasMore && !searchTerm && selectedClass === 'All' && (
          <div className="p-4 border-t border-[#ffe5a0] bg-[#fff8e8]">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 bg-black text-[#f4c514] font-black uppercase tracking-widest text-xs rounded-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#f4c514] border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </>
              ) : (
                <>
                  <i className="fas fa-chevron-down"></i>
                  Load More ({totalCount - history.length} remaining)
                </>
              )}
            </button>
          </div>
        )}

        {/* Note when filtering */}
        {(searchTerm || selectedClass !== 'All') && hasMore && (
          <div className="p-3 border-t border-[#ffe5a0] bg-[#fff8e8] text-center">
            <p className="text-[10px] text-gray-500 font-bold uppercase">
              <i className="fas fa-info-circle mr-1"></i>
              Filtering {history.length} loaded records. Clear filters to load more.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
