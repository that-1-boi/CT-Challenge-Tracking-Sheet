import React, { useState, useMemo, useEffect } from 'react';
import { generateAnalytics } from '../services/analyticsService';
import {
  AnalyticsResult,
  StudentProfile,
  ThemeStatistics,
  StudentThemeScore,
} from '../services/analyticsTypes';

type ViewMode = 'overview' | 'students' | 'themes';

const StudentAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    generateAnalytics()
      .then(result => {
        setAnalytics(result);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error generating analytics:', err);
        setError('Failed to generate analytics');
        setLoading(false);
      });
  }, []);

  const filteredStudents = useMemo(() => {
    if (!analytics) return [];
    if (!search) return analytics.studentProfiles;
    return analytics.studentProfiles.filter(p =>
      p.studentName.toLowerCase().includes(search.toLowerCase())
    );
  }, [analytics, search]);

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="w-12 h-12 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-black uppercase text-sm text-gray-400">Generating analytics...</p>
        <p className="text-[10px] text-gray-300 mt-2">Calculating curved scores and trends</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-10 text-center">
        <i className="fas fa-exclamation-triangle text-red-500 text-3xl mb-4"></i>
        <p className="font-black uppercase text-sm text-red-500">{error || 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="border-b-2 border-[#f4c514] pb-2 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-[#333] tracking-tighter italic uppercase">Performance Analytics</h1>
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Difficulty-adjusted scoring system</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black uppercase text-black/20 tracking-tighter">Generated:</span>
          <span className="ml-2 text-[10px] font-bold text-gray-500">
            {new Date(analytics.generatedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex flex-wrap gap-2">
        {(['overview', 'students', 'themes'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => {
              setViewMode(mode);
              setSelectedStudent(null);
            }}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === mode
                ? 'bg-black text-[#f4c514]'
                : 'bg-[#fff1d1] text-gray-600 hover:bg-[#f4c514] hover:text-black'
              }`}
          >
            {mode === 'overview' && <i className="fas fa-chart-pie mr-2"></i>}
            {mode === 'students' && <i className="fas fa-user-graduate mr-2"></i>}
            {mode === 'themes' && <i className="fas fa-tasks mr-2"></i>}
            {mode}
          </button>
        ))}
      </div>

      {/* Overview View */}
      {viewMode === 'overview' && (
        <OverviewSection analytics={analytics} />
      )}

      {/* Students View */}
      {viewMode === 'students' && (
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Search Column */}
          <div className="w-full lg:w-1/3 space-y-4">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                placeholder="Filter students..."
                className="w-full bg-[#fff1d1] border border-[#f4c514] p-3 pl-10 font-bold text-gray-800 focus:outline-none text-sm capitalize placeholder:text-gray-400"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              />
              {/* Mobile dropdown */}
              {search && searchFocused && filteredStudents.length > 0 && (
                <div className="lg:hidden absolute left-0 right-0 top-full z-50 bg-[#fff1d1] border border-[#f4c514] border-t-0 max-h-[200px] overflow-y-auto shadow-lg">
                  {filteredStudents.slice(0, 8).map(profile => (
                    <button
                      key={profile.studentId}
                      onClick={() => {
                        setSelectedStudent(profile);
                        setSearch('');
                        setSearchFocused(false);
                      }}
                      className="w-full text-left p-3 font-black uppercase text-xs hover:bg-[#f4c514] transition-colors border-b border-[#ffe5a0] last:border-b-0"
                    >
                      {profile.studentName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop list */}
            <div className="hidden lg:block bg-[#fff1d1] border border-[#ffe5a0] rounded-sm divide-y divide-[#ffe5a0] max-h-[600px] overflow-y-auto shadow-sm">
              {filteredStudents.length > 0 ? (
                filteredStudents.map(profile => (
                  <button
                    key={profile.studentId}
                    onClick={() => setSelectedStudent(profile)}
                    className={`w-full text-left p-3 font-black uppercase text-xs hover:bg-[#f4c514] transition-colors flex items-center justify-between group ${selectedStudent?.studentId === profile.studentId ? 'bg-[#f4c514]' : ''
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{profile.studentName}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded ${profile.strengthClassification === 'Mechanical' ? 'bg-orange-100 text-orange-600' :
                          profile.strengthClassification === 'Programming' ? 'bg-blue-100 text-blue-600' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                        {profile.strengthClassification}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400">{Math.round(profile.overallScore)}</span>
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
          <div className="flex-1">
            {selectedStudent ? (
              <StudentProfileCard profile={selectedStudent} onClose={() => setSelectedStudent(null)} />
            ) : (
              <StudentDirectory profiles={filteredStudents} onSelect={setSelectedStudent} />
            )}
          </div>
        </div>
      )}

      {/* Themes View */}
      {viewMode === 'themes' && (
        <ThemesSection themeStats={analytics.themeStatistics} />
      )}
    </div>
  );
};

// ============================================================================
// OVERVIEW SECTION
// ============================================================================

const OverviewSection: React.FC<{ analytics: AnalyticsResult }> = ({ analytics }) => {
  return (
    <div className="space-y-8">
      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={analytics.totalStudents} icon="fa-user-graduate" />
        <StatCard label="Total Themes" value={analytics.totalThemes} icon="fa-tasks" />
        <StatCard label="Total Sessions" value={analytics.totalSessions} icon="fa-calendar-check" />
        <StatCard
          label="Domain Strength"
          value={analytics.globalDomainStrength}
          icon={analytics.globalDomainStrength === 'Mechanical' ? 'fa-cog' : analytics.globalDomainStrength === 'Programming' ? 'fa-code' : 'fa-balance-scale'}
          valueColor={analytics.globalDomainStrength === 'Mechanical' ? 'text-orange-500' : analytics.globalDomainStrength === 'Programming' ? 'text-blue-500' : 'text-gray-600'}
        />
      </div>

      {/* Domain Performance */}
      <div className="bg-black p-6 rounded-sm shadow-xl">
        <h3 className="text-[#f4c514] font-black uppercase text-xs tracking-widest mb-4">Global Domain Performance</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="text-center">
            <div className="text-3xl font-black text-orange-400">{analytics.globalMechanicalAverage}</div>
            <div className="text-[9px] uppercase text-gray-400 font-bold mt-1">
              <i className="fas fa-cog mr-1"></i> Mechanical Avg
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black text-blue-400">{analytics.globalProgrammingAverage}</div>
            <div className="text-[9px] uppercase text-gray-400 font-bold mt-1">
              <i className="fas fa-code mr-1"></i> Programming Avg
            </div>
          </div>
        </div>
      </div>

      {/* Theme Difficulty */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-red-50 border border-red-200 p-6 rounded-sm">
          <h3 className="font-black uppercase text-xs tracking-widest text-red-800 mb-4">
            <i className="fas fa-fire mr-2"></i> Hardest Themes
          </h3>
          <div className="space-y-3">
            {analytics.hardestThemes.map((theme, i) => (
              <div key={theme.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 bg-red-200 text-red-800 rounded-full flex items-center justify-center text-[10px] font-black">
                    {i + 1}
                  </span>
                  <span className="font-bold text-sm">{theme.name}</span>
                  {theme.category && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${theme.category === 'mechanical' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                      {theme.category}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black text-red-600">{theme.meanCompletion}% avg</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 p-6 rounded-sm">
          <h3 className="font-black uppercase text-xs tracking-widest text-green-800 mb-4">
            <i className="fas fa-trophy mr-2"></i> Easiest Themes
          </h3>
          <div className="space-y-3">
            {analytics.easiestThemes.map((theme, i) => (
              <div key={theme.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-200 text-green-800 rounded-full flex items-center justify-center text-[10px] font-black">
                    {i + 1}
                  </span>
                  <span className="font-bold text-sm">{theme.name}</span>
                  {theme.category && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${theme.category === 'mechanical' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                      {theme.category}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black text-green-600">{theme.meanCompletion}% avg</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Algorithm Explanation */}
      <div className="bg-slate-50 border border-slate-200 p-6 rounded-sm">
        <h3 className="font-black uppercase text-xs tracking-widest text-slate-700 mb-3">
          <i className="fas fa-info-circle mr-2"></i> How Scores Are Calculated
        </h3>
        <div className="text-[11px] text-slate-600 space-y-2">
          <p><strong>1. Theme Normalization (Curve):</strong> Raw completion % is converted to a z-score, then curved to 50 ± 15 points. This accounts for theme difficulty.</p>
          <p><strong>2. Difficulty Weighting:</strong> Harder themes (low class average) contribute more to the final score. Weight = 1 - (mean completion / 100).</p>
          <p><strong>3. Domain Scores:</strong> Mechanical and Programming scores are weighted averages of themes in each category.</p>
          <p><strong>4. Growth Trend:</strong> Linear regression of curved scores over time determines if a student is Improving, Stable, or Declining.</p>
          <p><strong>5. Consistency:</strong> Lower variance in scores = higher consistency rating.</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STAT CARD
// ============================================================================

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: string;
  valueColor?: string;
}> = ({ label, value, icon, valueColor = 'text-[#f4c514]' }) => (
  <div className="bg-[#fff1d1] border border-[#ffe5a0] p-4 rounded-sm">
    <div className="flex items-center gap-2 mb-2">
      <i className={`fas ${icon} text-[#f4c514] text-sm`}></i>
      <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">{label}</span>
    </div>
    <div className={`text-2xl font-black ${valueColor}`}>{value}</div>
  </div>
);

// ============================================================================
// LINE GRAPH COMPONENT (SVG-based)
// ============================================================================

const PerformanceLineGraph: React.FC<{ themeScores: StudentThemeScore[] }> = ({ themeScores }) => {
  if (themeScores.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 p-8 rounded-sm text-center">
        <p className="text-[10px] text-gray-400 uppercase font-bold">No theme data available</p>
      </div>
    );
  }

  const width = 800;
  const height = 300;
  const padding = { top: 30, right: 30, bottom: 60, left: 50 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // X-axis: theme index
  const xScale = (index: number) => padding.left + (index / (themeScores.length - 1 || 1)) * graphWidth;

  // Y-axis: 0-100 for raw data, class mean, class median; 20-80 for curved score
  const yScaleRaw = (value: number) => padding.top + graphHeight - (value / 100) * graphHeight;
  const yScaleCurved = (value: number) => {
    // Map curved score (typically 20-80) to the same visual range
    const normalized = (value - 20) / 60; // 0-1 range
    return padding.top + graphHeight - normalized * graphHeight;
  };

  // Generate path data
  const createLinePath = (values: number[], scale: (v: number) => number) => {
    return values.map((v, i) => {
      const x = xScale(i);
      const y = scale(v);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  const rawPath = createLinePath(themeScores.map(s => s.rawCompletion), yScaleRaw);
  const meanPath = createLinePath(themeScores.map(s => s.classMean), yScaleRaw);
  const medianPath = createLinePath(themeScores.map(s => s.classMedian), yScaleRaw);
  const curvedPath = createLinePath(themeScores.map(s => s.curvedScore), yScaleCurved);

  return (
    <div className="bg-white border border-slate-200 p-4 rounded-sm">
      <h3 className="text-xs font-black uppercase tracking-widest border-l-4 border-[#f4c514] pl-3 italic mb-4">
        Performance Across Themes
      </h3>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-[9px] font-bold">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#f4c514]"></div>
          <span>Student Raw %</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-gray-400" style={{ strokeDasharray: '4,4' }}></div>
          <span>Class Mean</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-400"></div>
          <span>Class Median</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500"></div>
          <span>Curved Score</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[600px]" style={{ maxHeight: '350px' }}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line
                x1={padding.left}
                y1={yScaleRaw(v)}
                x2={width - padding.right}
                y2={yScaleRaw(v)}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={yScaleRaw(v) + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-400"
              >
                {v}%
              </text>
            </g>
          ))}

          {/* Class Mean line (dashed gray) */}
          <path
            d={meanPath}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeDasharray="6,4"
          />

          {/* Class Median line (blue) */}
          <path
            d={medianPath}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
          />

          {/* Curved Score line (green) */}
          <path
            d={curvedPath}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
          />

          {/* Student Raw line (yellow/gold - main line) */}
          <path
            d={rawPath}
            fill="none"
            stroke="#f4c514"
            strokeWidth="3"
          />

          {/* Data points for student raw */}
          {themeScores.map((score, i) => (
            <g key={score.themeName}>
              {/* Student raw point */}
              <circle
                cx={xScale(i)}
                cy={yScaleRaw(score.rawCompletion)}
                r="5"
                fill="#f4c514"
                stroke="white"
                strokeWidth="2"
              />
              {/* Curved score point */}
              <circle
                cx={xScale(i)}
                cy={yScaleCurved(score.curvedScore)}
                r="4"
                fill="#22c55e"
                stroke="white"
                strokeWidth="1.5"
              />
            </g>
          ))}

          {/* X-axis labels (theme names) */}
          {themeScores.map((score, i) => (
            <g key={`label-${score.themeName}`}>
              <text
                x={xScale(i)}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                className="text-[9px] fill-gray-600 font-bold"
                transform={`rotate(-30, ${xScale(i)}, ${height - padding.bottom + 20})`}
              >
                {score.themeName.length > 12 ? score.themeName.slice(0, 12) + '...' : score.themeName}
              </text>
              {/* Category indicator */}
              {score.themeCategory && (
                <circle
                  cx={xScale(i)}
                  cy={height - padding.bottom + 45}
                  r="4"
                  fill={score.themeCategory === 'mechanical' ? '#f97316' : '#3b82f6'}
                />
              )}
            </g>
          ))}

          {/* Y-axis label */}
          <text
            x={15}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90, 15, ${height / 2})`}
            className="text-[10px] fill-gray-500 font-bold"
          >
            Score / Completion %
          </text>
        </svg>
      </div>

      {/* Detailed data table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 font-black uppercase text-gray-500">Theme</th>
              <th className="text-right py-2 font-black uppercase text-gray-500">Raw</th>
              <th className="text-right py-2 font-black uppercase text-gray-500">Mean</th>
              <th className="text-right py-2 font-black uppercase text-gray-500">Median</th>
              <th className="text-right py-2 font-black uppercase text-gray-500">Curved</th>
              <th className="text-right py-2 font-black uppercase text-gray-500">vs Mean</th>
            </tr>
          </thead>
          <tbody>
            {themeScores.map(score => {
              const diff = score.rawCompletion - score.classMean;
              return (
                <tr key={score.themeName} className="border-b border-slate-100">
                  <td className="py-2 font-bold flex items-center gap-1">
                    {score.themeName}
                    {score.themeCategory && (
                      <span className={`w-2 h-2 rounded-full ${score.themeCategory === 'mechanical' ? 'bg-orange-500' : 'bg-blue-500'
                        }`}></span>
                    )}
                  </td>
                  <td className="text-right py-2 font-black text-[#f4c514]">{Math.round(score.rawCompletion)}%</td>
                  <td className="text-right py-2 text-gray-500">{Math.round(score.classMean)}%</td>
                  <td className="text-right py-2 text-blue-500">{Math.round(score.classMedian)}%</td>
                  <td className="text-right py-2 font-black text-green-600">{Math.round(score.curvedScore)}</td>
                  <td className={`text-right py-2 font-black ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {diff >= 0 ? '+' : ''}{Math.round(diff)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// STUDENT PROFILE CARD
// ============================================================================

const StudentProfileCard: React.FC<{
  profile: StudentProfile;
  onClose: () => void;
}> = ({ profile, onClose }) => {
  return (
    <div className="animate-in slide-in-from-right-4 duration-300 space-y-6">
      {/* Header */}
      <div className="bg-black p-6 text-white rounded-sm shadow-xl relative overflow-hidden border-b-8 border-[#f4c514]">
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter">{profile.studentName}</h2>
              <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">{profile.className}</div>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-[#f4c514] transition-colors">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>

          {/* Overall Score */}
          <div className="mb-6 space-y-2">
            <div className="flex justify-between items-end">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#f4c514]">Curved Overall Score</span>
              <span className="text-xl font-black">{Math.round(profile.overallScore)}</span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#f4c514] transition-all duration-1000"
                style={{ width: `${Math.min(100, profile.overallScore)}%` }}
              ></div>
            </div>
            <div className="text-[9px] text-gray-400">
              Percentile in class: <span className="text-white font-bold">{Math.round(profile.overallPercentile)}%</span>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
            <div>
              <div className="text-[#f4c514] text-xl font-black">{profile.totalSessions}</div>
              <div className="text-[8px] uppercase font-bold text-gray-400 tracking-widest">Sessions</div>
            </div>
            <div>
              <div className="text-[#f4c514] text-xl font-black">{profile.totalChallengesCompleted}</div>
              <div className="text-[8px] uppercase font-bold text-gray-400 tracking-widest">Challenges</div>
            </div>
            <div>
              <div className="text-[#f4c514] text-xl font-black">{Math.round(profile.averageRawCompletion)}%</div>
              <div className="text-[8px] uppercase font-bold text-gray-400 tracking-widest">Raw Avg</div>
            </div>
          </div>
        </div>
      </div>

      {/* Domain Scores */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-sm">
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-cog text-orange-500"></i>
            <span className="text-[9px] font-black uppercase text-orange-800 tracking-wider">Mechanical</span>
          </div>
          <div className="text-3xl font-black text-orange-600">{Math.round(profile.mechanicalScore)}</div>
          <div className="text-[9px] text-orange-600">{profile.mechanicalThemeCount} themes</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-sm">
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-code text-blue-500"></i>
            <span className="text-[9px] font-black uppercase text-blue-800 tracking-wider">Programming</span>
          </div>
          <div className="text-3xl font-black text-blue-600">{Math.round(profile.programmingScore)}</div>
          <div className="text-[9px] text-blue-600">{profile.programmingThemeCount} themes</div>
        </div>
      </div>

      {/* Classification & Trends */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#fff1d1] border border-[#ffe5a0] p-4 rounded-sm text-center">
          <div className="text-[9px] font-black uppercase text-gray-500 mb-1">Strength</div>
          <div className={`text-sm font-black uppercase ${profile.strengthClassification === 'Mechanical' ? 'text-orange-600' :
              profile.strengthClassification === 'Programming' ? 'text-blue-600' :
                'text-gray-600'
            }`}>
            {profile.strengthClassification}
          </div>
        </div>
        <div className="bg-[#fff1d1] border border-[#ffe5a0] p-4 rounded-sm text-center">
          <div className="text-[9px] font-black uppercase text-gray-500 mb-1">Growth</div>
          <div className={`text-sm font-black uppercase ${profile.growthTrend === 'Improving' ? 'text-green-600' :
              profile.growthTrend === 'Declining' ? 'text-red-600' :
                'text-gray-600'
            }`}>
            {profile.growthTrend === 'Improving' && <i className="fas fa-arrow-up mr-1"></i>}
            {profile.growthTrend === 'Declining' && <i className="fas fa-arrow-down mr-1"></i>}
            {profile.growthTrend === 'Stable' && <i className="fas fa-minus mr-1"></i>}
            {profile.growthTrend}
          </div>
        </div>
        <div className="bg-[#fff1d1] border border-[#ffe5a0] p-4 rounded-sm text-center">
          <div className="text-[9px] font-black uppercase text-gray-500 mb-1">Consistency</div>
          <div className={`text-sm font-black uppercase ${profile.consistencyLevel === 'High' ? 'text-green-600' :
              profile.consistencyLevel === 'Low' ? 'text-red-600' :
                'text-yellow-600'
            }`}>
            {profile.consistencyLevel}
          </div>
        </div>
      </div>

      {/* Performance Line Graph */}
      <PerformanceLineGraph themeScores={profile.themeScores} />
    </div>
  );
};

// ============================================================================
// STUDENT DIRECTORY
// ============================================================================

const StudentDirectory: React.FC<{
  profiles: StudentProfile[];
  onSelect: (profile: StudentProfile) => void;
}> = ({ profiles, onSelect }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-[#f4c514] p-8 rounded-sm text-black border-l-[12px] border-black shadow-lg">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Student Profiles</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
          {profiles.length} students with analytics data
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {profiles.map(profile => (
          <button
            key={profile.studentId}
            onClick={() => onSelect(profile)}
            className="bg-white border-2 border-slate-100 p-5 text-left rounded-sm hover:border-[#f4c514] hover:shadow-xl transition-all group"
          >
            <h4 className="text-lg font-black uppercase italic text-black leading-tight mb-2">{profile.studentName}</h4>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase ${profile.strengthClassification === 'Mechanical' ? 'bg-orange-100 text-orange-600' :
                  profile.strengthClassification === 'Programming' ? 'bg-blue-100 text-blue-600' :
                    'bg-gray-100 text-gray-600'
                }`}>
                {profile.strengthClassification}
              </span>
              <span className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase ${profile.growthTrend === 'Improving' ? 'bg-green-100 text-green-600' :
                  profile.growthTrend === 'Declining' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-600'
                }`}>
                {profile.growthTrend}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase text-slate-400">{profile.className}</span>
              <span className="text-xl font-black text-[#f4c514]">{Math.round(profile.overallScore)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// THEMES SECTION
// ============================================================================

const ThemesSection: React.FC<{ themeStats: ThemeStatistics[] }> = ({ themeStats }) => {
  return (
    <div className="space-y-6">
      <div className="bg-[#f4c514] p-8 rounded-sm text-black border-l-[12px] border-black shadow-lg">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Theme Difficulty Analysis</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
          Ranked by average class completion (hardest first)
        </p>
      </div>

      <div className="space-y-4">
        {themeStats.map(theme => (
          <div key={theme.themeName} className="bg-white border border-slate-200 p-6 rounded-sm">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${theme.difficultyLabel === 'Very Hard' ? 'bg-red-100 text-red-600' :
                    theme.difficultyLabel === 'Hard' ? 'bg-orange-100 text-orange-600' :
                      theme.difficultyLabel === 'Moderate' ? 'bg-yellow-100 text-yellow-600' :
                        theme.difficultyLabel === 'Easy' ? 'bg-green-100 text-green-600' :
                          'bg-emerald-100 text-emerald-600'
                  }`}>
                  #{theme.difficultyRank}
                </span>
                <div>
                  <h3 className="font-black text-lg uppercase">{theme.themeName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {theme.themeCategory && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${theme.themeCategory === 'mechanical' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                        {theme.themeCategory}
                      </span>
                    )}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${theme.difficultyLabel === 'Very Hard' ? 'bg-red-100 text-red-600' :
                        theme.difficultyLabel === 'Hard' ? 'bg-orange-100 text-orange-600' :
                          theme.difficultyLabel === 'Moderate' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-green-100 text-green-600'
                      }`}>
                      {theme.difficultyLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black">{Math.round(theme.meanCompletion)}%</div>
                <div className="text-[9px] text-gray-400 font-bold">Mean Completion</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div>
                <div className="text-[9px] text-gray-400 font-bold uppercase">Students</div>
                <div className="font-black">{theme.totalStudents}</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 font-bold uppercase">Std Dev</div>
                <div className="font-black">{Math.round(theme.standardDeviation)}</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 font-bold uppercase">Median</div>
                <div className="font-black">{Math.round(theme.medianCompletion)}%</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 font-bold uppercase">Min</div>
                <div className="font-black">{Math.round(theme.minCompletion)}%</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 font-bold uppercase">Max</div>
                <div className="font-black">{Math.round(theme.maxCompletion)}%</div>
              </div>
            </div>

            {/* Distribution Bar */}
            <div className="space-y-2">
              <div className="text-[9px] text-gray-400 font-bold uppercase">Score Distribution</div>
              <div className="flex h-6 rounded overflow-hidden">
                {theme.distribution.map((bucket, i) => (
                  <div
                    key={bucket.bucket}
                    className={`flex items-center justify-center text-[8px] font-bold text-white ${i === 0 ? 'bg-red-400' :
                        i === 1 ? 'bg-orange-400' :
                          i === 2 ? 'bg-yellow-400' :
                            i === 3 ? 'bg-green-400' :
                              'bg-emerald-400'
                      }`}
                    style={{ width: `${Math.max(bucket.percent, 5)}%` }}
                    title={`${bucket.bucket}: ${bucket.count} students (${Math.round(bucket.percent)}%)`}
                  >
                    {bucket.count > 0 && bucket.count}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudentAnalytics;
