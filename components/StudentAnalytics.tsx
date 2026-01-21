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
    const profiles = search
      ? analytics.studentProfiles.filter(p =>
        p.studentName.toLowerCase().includes(search.toLowerCase())
      )
      : analytics.studentProfiles;
    // Sort by highest curved average (overallScore) descending
    return [...profiles].sort((a, b) => b.overallScore - a.overallScore);
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
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Search Column - narrower */}
          <div className="w-full lg:w-56 xl:w-64 shrink-0 space-y-3">
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

            {/* Desktop list - compact */}
            <div className="hidden lg:block bg-[#fff1d1] border border-[#ffe5a0] rounded-sm divide-y divide-[#ffe5a0] max-h-[500px] overflow-y-auto shadow-sm">
              {filteredStudents.length > 0 ? (
                filteredStudents.map(profile => (
                  <button
                    key={profile.studentId}
                    onClick={() => setSelectedStudent(profile)}
                    className={`w-full text-left px-2 py-2 font-black uppercase text-[10px] hover:bg-[#f4c514] transition-colors flex items-center justify-between gap-1 ${selectedStudent?.studentId === profile.studentId ? 'bg-[#f4c514]' : ''
                      }`}
                  >
                    <span className="truncate">{profile.studentName}</span>
                    <span className="text-[9px] font-bold text-gray-400 shrink-0">{Math.round(profile.overallScore)}</span>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-gray-400 italic text-[9px] uppercase tracking-widest">
                  No matches
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

      {/* Student Scatter Plot - Team Readiness Map */}
      <StudentScatterPlot profiles={analytics.studentProfiles} />

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
// READINESS TIER LOGIC
// ============================================================================

type ReadinessTier = 'competition-ready' | 'near-ready' | 'specialist' | 'not-ready';

interface StudentPoint {
  profile: StudentProfile;
  tier: ReadinessTier;
  tierLabel: string;
  color: string;
}

function getReadinessTier(profile: StudentProfile): { tier: ReadinessTier; label: string; color: string } {
  const curvedAvg = profile.overallScore;
  const mech = profile.mechanicalScore;
  const prog = profile.programmingScore;

  // Competition Ready: curved_avg >= 85 AND mech >= 60 AND prog >= 60
  if (curvedAvg >= 85 && mech >= 60 && prog >= 60) {
    return { tier: 'competition-ready', label: 'Competition Ready', color: '#22c55e' };
  }

  // Near Ready: curved_avg >= 70
  if (curvedAvg >= 70) {
    return { tier: 'near-ready', label: 'Near Ready', color: '#eab308' };
  }

  // Specialist: mech >= 80 XOR prog >= 80 (one but not both)
  const mechSpecialist = mech >= 80;
  const progSpecialist = prog >= 80;
  if ((mechSpecialist && !progSpecialist) || (!mechSpecialist && progSpecialist)) {
    return { tier: 'specialist', label: 'Specialist', color: '#3b82f6' };
  }

  // Not Ready: otherwise
  return { tier: 'not-ready', label: 'Not Ready', color: '#ef4444' };
}

// ============================================================================
// STUDENT SCATTER PLOT COMPONENT
// ============================================================================

const StudentScatterPlot: React.FC<{ profiles: StudentProfile[] }> = ({ profiles }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hoveredStudent, setHoveredStudent] = useState<{ point: StudentPoint; x: number; y: number } | null>(null);

  // Process students into points with tier information
  const studentPoints: StudentPoint[] = useMemo(() => {
    return profiles.map(profile => {
      const { tier, label, color } = getReadinessTier(profile);
      return { profile, tier, tierLabel: label, color };
    });
  }, [profiles]);

  // Calculate medians for crosshairs
  const medians = useMemo(() => {
    if (profiles.length === 0) return { mechanical: 50, programming: 50 };
    const mechScores = profiles.map(p => p.mechanicalScore).sort((a, b) => a - b);
    const progScores = profiles.map(p => p.programmingScore).sort((a, b) => a - b);
    const mid = Math.floor(profiles.length / 2);
    return {
      mechanical: profiles.length % 2 === 0
        ? (mechScores[mid - 1] + mechScores[mid]) / 2
        : mechScores[mid],
      programming: profiles.length % 2 === 0
        ? (progScores[mid - 1] + progScores[mid]) / 2
        : progScores[mid],
    };
  }, [profiles]);

  // Calculate competition pool (top 15-20% by curved average)
  const competitionPool = useMemo(() => {
    if (profiles.length < 5) return [];
    const sorted = [...profiles].sort((a, b) => b.overallScore - a.overallScore);
    const topCount = Math.max(3, Math.ceil(profiles.length * 0.18)); // ~18% = between 15-20%
    return sorted.slice(0, topCount);
  }, [profiles]);

  // Calculate convex hull for competition pool
  const convexHullPoints = useMemo(() => {
    if (competitionPool.length < 3) return [];

    // Get points for convex hull calculation
    const points = competitionPool.map(p => ({
      x: p.mechanicalScore,
      y: p.programmingScore,
    }));

    // Gift wrapping algorithm for convex hull
    const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const sortedPoints = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

    const lower: { x: number; y: number }[] = [];
    for (const p of sortedPoints) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper: { x: number; y: number }[] = [];
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      const p = sortedPoints[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper];
  }, [competitionPool]);

  // Tier counts for legend
  const tierCounts = useMemo(() => {
    const counts = { 'competition-ready': 0, 'near-ready': 0, 'specialist': 0, 'not-ready': 0 };
    studentPoints.forEach(sp => counts[sp.tier]++);
    return counts;
  }, [studentPoints]);

  if (profiles.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 p-8 rounded-sm text-center">
        <p className="text-[10px] text-gray-400 uppercase font-bold">No student data available</p>
      </div>
    );
  }

  // Chart dimensions - 3x width, 2x height for better spread
  const width = 2100;
  const height = 1000;
  const padding = { top: 40, right: 40, bottom: 70, left: 70 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Axis range: 20-80 (instead of 0-100)
  const AXIS_MIN = 20;
  const AXIS_MAX = 80;
  const AXIS_RANGE = AXIS_MAX - AXIS_MIN;

  // Fixed axes: 20-80 for both
  const xScale = (value: number) => {
    const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, value));
    return padding.left + ((clamped - AXIS_MIN) / AXIS_RANGE) * graphWidth;
  };
  const yScale = (value: number) => {
    const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, value));
    return padding.top + graphHeight - ((clamped - AXIS_MIN) / AXIS_RANGE) * graphHeight;
  };

  // Point size calculation with non-linear scale
  const MIN_RADIUS = 6;
  const MAX_RADIUS = 24;

  const getRadius = (curvedAvg: number) => {
    // Normalize 40–60 → 0–1
    const t = Math.min(1, Math.max(0, (curvedAvg - 40) / 20));

    // Nonlinear scaling (quadratic)
    const eased = t * t;

    return MIN_RADIUS + eased * (MAX_RADIUS - MIN_RADIUS);
  };

  // Handle hover with boundary-aware tooltip positioning
  const handleMouseEnter = (point: StudentPoint, event: React.MouseEvent<SVGCircleElement>) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const circleRect = event.currentTarget.getBoundingClientRect();

    let x = circleRect.left + circleRect.width / 2 - containerRect.left;
    let y = circleRect.top - containerRect.top - 10;

    // Clamp tooltip position to stay within container bounds
    const tooltipWidth = 180;
    const tooltipHeight = 180;

    // Horizontal bounds
    if (x - tooltipWidth / 2 < 0) {
      x = tooltipWidth / 2 + 10;
    } else if (x + tooltipWidth / 2 > containerRect.width) {
      x = containerRect.width - tooltipWidth / 2 - 10;
    }

    // Vertical bounds - if tooltip would go above container, show below the point
    if (y - tooltipHeight < 0) {
      y = circleRect.bottom - containerRect.top + 10;
    }

    setHoveredStudent({ point, x, y });
  };

  // Sort points so larger ones render first (smaller on top)
  const sortedPoints = [...studentPoints].sort((a, b) =>
    getRadius(b.profile.overallScore) - getRadius(a.profile.overallScore)
  );

  return (
    <div className="bg-white border-2 border-slate-200 p-6 rounded-sm">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest border-l-4 border-[#f4c514] pl-3 italic">
            Team Readiness Map
          </h3>
          <p className="text-[9px] text-gray-500 mt-1 pl-4">
            X = Mechanical | Y = Programming | Size = Overall Score
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[16px]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#22c55e]"></span>
            <span className="font-bold text-gray-600">Ready ({tierCounts['competition-ready']})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#eab308]"></span>
            <span className="font-bold text-gray-600">Near ({tierCounts['near-ready']})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6]"></span>
            <span className="font-bold text-gray-600">Specialist ({tierCounts['specialist']})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ef4444]"></span>
            <span className="font-bold text-gray-600">Develop ({tierCounts['not-ready']})</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto relative" ref={containerRef}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minHeight: '800px', maxHeight: '1000px' }}>

          {/* Grid lines - 20-80 range with steps of 10 */}
          {[20, 30, 40, 50, 60, 70, 80].map(v => (
            <g key={`grid-${v}`}>
              {/* Vertical */}
              <line x1={xScale(v)} y1={padding.top} x2={xScale(v)} y2={height - padding.bottom} stroke="#e5e7eb" strokeWidth="1" />
              {/* Horizontal */}
              <line x1={padding.left} y1={yScale(v)} x2={width - padding.right} y2={yScale(v)} stroke="#e5e7eb" strokeWidth="1" />
            </g>
          ))}

          {/* Median crosshairs */}
          <line
            x1={xScale(medians.mechanical)} y1={padding.top}
            x2={xScale(medians.mechanical)} y2={height - padding.bottom}
            stroke="#6b7280" strokeWidth="2" strokeDasharray="8,6" opacity="0.7"
          />
          <line
            x1={padding.left} y1={yScale(medians.programming)}
            x2={width - padding.right} y2={yScale(medians.programming)}
            stroke="#6b7280" strokeWidth="2" strokeDasharray="8,6" opacity="0.7"
          />

          {/* Competition pool convex hull */}
          {convexHullPoints.length >= 3 && (
            <polygon
              points={convexHullPoints.map(p => `${xScale(p.x)},${yScale(p.y)}`).join(' ')}
              fill="#22c55e"
              fillOpacity="0.1"
              stroke="#22c55e"
              strokeWidth="3"
              strokeDasharray="6,3"
            />
          )}

          {/* Competition Pool label */}
          {convexHullPoints.length >= 3 && (
            <text
              x={xScale(Math.max(...convexHullPoints.map(p => p.x)) - 2)}
              y={yScale(Math.max(...convexHullPoints.map(p => p.y)) + 2)}
              className="text-[12px] fill-green-700 font-black"
            >
              COMPETITION POOL
            </text>
          )}

          {/* X-axis labels - 20-80 range */}
          {[20, 30, 40, 50, 60, 70, 80].map(v => (
            <text key={`x-${v}`} x={xScale(v)} y={height - padding.bottom + 25} textAnchor="middle" className="text-[14px] fill-gray-500 font-bold">
              {v}
            </text>
          ))}
          <text x={width / 2} y={height - 15} textAnchor="middle" className="text-[16px] fill-orange-600 font-black uppercase">
            Mechanical Proficiency
          </text>

          {/* Y-axis labels - 20-80 range */}
          {[20, 30, 40, 50, 60, 70, 80].map(v => (
            <text key={`y-${v}`} x={padding.left - 15} y={yScale(v) + 5} textAnchor="end" className="text-[14px] fill-gray-500 font-bold">
              {v}
            </text>
          ))}
          <text x={25} y={height / 2} textAnchor="middle" transform={`rotate(-90, 25, ${height / 2})`} className="text-[16px] fill-blue-600 font-black uppercase">
            Programming Proficiency
          </text>

          {/* Student points - sorted so smaller (higher score) on top */}
          {sortedPoints.map(point => {
            const r = getRadius(point.profile.overallScore);
            const isHovered = hoveredStudent?.point.profile.studentId === point.profile.studentId;

            // Apply slight jitter to prevent exact overlaps
            const jitterX = (Math.sin(point.profile.studentId.charCodeAt(0) * 0.5) * 3);
            const jitterY = (Math.cos(point.profile.studentId.charCodeAt(0) * 0.7) * 3);

            return (
              <circle
                key={point.profile.studentId}
                cx={xScale(point.profile.mechanicalScore) + jitterX}
                cy={yScale(point.profile.programmingScore) + jitterY}
                r={isHovered ? r + 3 : r}
                fill={point.color}
                fillOpacity={0.85}
                stroke={isHovered ? '#000' : 'white'}
                strokeWidth={isHovered ? 3 : 2}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={(e) => handleMouseEnter(point, e)}
                onMouseLeave={() => setHoveredStudent(null)}
              />
            );
          })}

          {/* Border */}
          <rect x={padding.left} y={padding.top} width={graphWidth} height={graphHeight} fill="none" stroke="#d1d5db" strokeWidth="2" />
        </svg>

        {/* HTML tooltip - positioned to stay within bounds */}
        {hoveredStudent && (
          <div
            className="absolute z-50 bg-black text-white text-[11px] p-4 rounded shadow-xl pointer-events-none"
            style={{
              left: hoveredStudent.x,
              top: hoveredStudent.y,
              transform: 'translate(-50%, -100%)',
              minWidth: '180px',
            }}
          >
            <div className="font-black text-base uppercase mb-2 text-[#f4c514]">{hoveredStudent.point.profile.studentName}</div>
            <div className="space-y-1.5">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Mechanical:</span>
                <span className="font-bold text-orange-400">{Math.round(hoveredStudent.point.profile.mechanicalScore)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Programming:</span>
                <span className="font-bold text-blue-400">{Math.round(hoveredStudent.point.profile.programmingScore)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Raw Avg:</span>
                <span className="font-bold">{Math.round(hoveredStudent.point.profile.averageRawCompletion)}%</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Curved Avg:</span>
                <span className="font-bold">{Math.round(hoveredStudent.point.profile.overallScore)}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1.5 border-t border-white/20 mt-1.5">
                <span className="text-gray-400">Tier:</span>
                <span className="font-black" style={{ color: hoveredStudent.point.color }}>{hoveredStudent.point.tierLabel}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick stats below chart */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="bg-green-50 border border-green-200 p-2 rounded">
          <div className="text-lg font-black text-green-600">{tierCounts['competition-ready']}</div>
          <div className="text-[8px] uppercase font-bold text-green-700">Competition Ready</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 p-2 rounded">
          <div className="text-lg font-black text-yellow-600">{tierCounts['near-ready']}</div>
          <div className="text-[8px] uppercase font-bold text-yellow-700">Near Ready</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-2 rounded">
          <div className="text-lg font-black text-blue-600">{tierCounts['specialist']}</div>
          <div className="text-[8px] uppercase font-bold text-blue-700">Specialists</div>
        </div>
        <div className="bg-red-50 border border-red-200 p-2 rounded">
          <div className="text-lg font-black text-red-600">{tierCounts['not-ready']}</div>
          <div className="text-[8px] uppercase font-bold text-red-700">Developing</div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// LINE GRAPH COMPONENT (SVG-based)
// ============================================================================

const PerformanceLineGraph: React.FC<{ themeScores: StudentThemeScore[] }> = ({ themeScores }) => {
  const [hoveredTheme, setHoveredTheme] = useState<{ name: string; x: number; y: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle mouse enter on theme indicator circles
  const handleThemeHover = (themeName: string, event: React.MouseEvent<SVGCircleElement>) => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const circleRect = event.currentTarget.getBoundingClientRect();

    // Calculate position relative to the container
    const x = circleRect.left + circleRect.width / 2 - containerRect.left;
    const y = circleRect.bottom - containerRect.top + 8; // 8px below the circle

    setHoveredTheme({ name: themeName, x, y });
  };

  if (themeScores.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 p-8 rounded-sm text-center">
        <p className="text-[10px] text-gray-400 uppercase font-bold">No theme data available</p>
      </div>
    );
  }

  // Reduced by 30% height: 720x224
  const width = 720;
  const height = 224;
  const padding = { top: 20, right: 30, bottom: 50, left: 45 };
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
    <div className="bg-white border-2 border-slate-200 p-6 rounded-sm">
      <h3 className="text-sm font-black uppercase tracking-widest border-l-4 border-[#f4c514] pl-3 italic mb-6">
        Performance Across Themes
      </h3>

      {/* Legend - more prominent */}
      <div className="flex flex-wrap gap-6 mb-6 p-4 bg-slate-50 rounded-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-1 bg-[#f4c514] rounded"></div>
          <span className="text-xs font-black text-gray-700">Student Raw %</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-0.5 bg-gray-400 border-dashed border-t-2 border-gray-400"></div>
          <span className="text-xs font-bold text-gray-500">Class Mean</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-1 bg-blue-400 rounded"></div>
          <span className="text-xs font-bold text-blue-600">Class Median</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-1 bg-green-500 rounded"></div>
          <span className="text-xs font-bold text-green-600">Curved Score</span>
        </div>
      </div>

      <div className="overflow-x-auto relative" ref={containerRef}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[560px]" style={{ minHeight: '224px' }}>
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
            strokeWidth="1.5"
            strokeDasharray="6,4"
          />

          {/* Class Median line (blue) */}
          <path
            d={medianPath}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1.5"
          />

          {/* Curved Score line (green) */}
          <path
            d={curvedPath}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
          />

          {/* Student Raw line (yellow/gold - main line) */}
          <path
            d={rawPath}
            fill="none"
            stroke="#f4c514"
            strokeWidth="2.5"
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
                strokeWidth="1.5"
              />
              {/* Curved score point */}
              <circle
                cx={xScale(i)}
                cy={yScaleCurved(score.curvedScore)}
                r="3.5"
                fill="#22c55e"
                stroke="white"
                strokeWidth="1.5"
              />
            </g>
          ))}

          {/* X-axis theme indicators with hover tooltips */}
          {themeScores.map((score, i) => (
            <circle
              key={`label-${score.themeName}`}
              cx={xScale(i)}
              cy={height - padding.bottom + 15}
              r="5"
              fill={score.themeCategory === 'mechanical' ? '#f97316' : score.themeCategory === 'programming' ? '#3b82f6' : '#9ca3af'}
              stroke={hoveredTheme?.name === score.themeName ? '#000' : 'white'}
              strokeWidth={hoveredTheme?.name === score.themeName ? 2 : 1.5}
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={(e) => handleThemeHover(score.themeName, e)}
              onMouseLeave={() => setHoveredTheme(null)}
            />
          ))}

          {/* Y-axis label - aligned with graph left edge */}
          <text
            x={8}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90, 8, ${height / 2})`}
            className="text-[8px] fill-gray-500 font-bold"
          >
            Score / Completion %
          </text>
        </svg>

        {/* HTML tooltip - can overflow SVG bounds */}
        {hoveredTheme && (
          <div
            className="absolute z-50 bg-black text-white text-[16px] font-bold px-1.5 py-1 rounded whitespace-nowrap pointer-events-none"
            style={{
              left: hoveredTheme.x,
              top: hoveredTheme.y,
              transform: 'translateX(-50%)',
            }}
          >
            {hoveredTheme.name}
          </div>
        )}
      </div>

      {/* Detailed data table */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-[10px]">
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
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter">{profile.studentName}</h2>
              {/* Domain Scores directly after name - larger */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-orange-500/20 px-3 py-2 rounded">
                  <i className="fas fa-cog text-orange-400 text-base"></i>
                  <span className="text-orange-400 font-black text-xl">{Math.round(profile.mechanicalScore)}</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-500/20 px-3 py-2 rounded">
                  <i className="fas fa-code text-blue-400 text-base"></i>
                  <span className="text-blue-400 font-black text-xl">{Math.round(profile.programmingScore)}</span>
                </div>
              </div>
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
              Percentile: <span className="text-white font-bold">{Math.round(profile.overallPercentile)}%</span>
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
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-lg font-black uppercase italic text-black leading-tight">{profile.studentName}</h4>
              <span className="text-xl font-black text-[#f4c514]">{Math.round(profile.overallScore)}</span>
            </div>
            <div className="flex items-center gap-2">
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
                    className={`flex items-center justify-center text-[16px] font-bold text-white ${i === 0 ? 'bg-slate-500' :
                      i === 1 ? 'bg-red-400' :
                        i === 2 ? 'bg-orange-400' :
                          i === 3 ? 'bg-yellow-400' :
                            i === 4 ? 'bg-green-400' :
                              'bg-emerald-400'
                      }`}
                    style={{ width: `${Math.max(bucket.percent, 5)}%` }}
                    title={`${bucket.bucket}: ${bucket.count} students (${Math.round(bucket.percent)}%)`}
                  >
                    {bucket.count > 0 && bucket.count}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[8px] text-gray-400">
                <span>0% (No progress)</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudentAnalytics;
