import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { generateAnalytics, clearAnalyticsCache } from '../services/analyticsService';
import {
  AnalyticsResult,
  StudentProfile,
  ThemeStatistics,
  StudentThemeScore,
  StudentAttributesSummary,
} from '../services/analyticsTypes';
import { subscribeSyncEvent } from '../services/syncEvents';
import { loadStudentAttributes, saveStudentAttributes } from '../services/supabaseService';

// ============================================================================
// STUDENT ATTRIBUTES TYPES (Database-backed, Fixed 6-axis)
// ============================================================================

// Attribute names for radar chart display
const ATTRIBUTE_LABELS = {
  curvedScore: 'Curved Score',
  competitiveness: 'Competitiveness',
  independence: 'Independence',
  teamwork: 'Teamwork',
  performance: 'Performance',
  coachability: 'Coachability',
} as const;

// State for student attributes (loaded from database)
interface StudentAttributesState {
  competitiveness: number;
  independence: number;
  teamwork: number;
  performance: number;
  coachability: number;
  comments: string;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  error: string | null;
}

const DEFAULT_ATTRIBUTES_STATE: StudentAttributesState = {
  competitiveness: 50,
  independence: 50,
  teamwork: 50,
  performance: 50,
  coachability: 50,
  comments: '',
  isLoading: false,
  hasUnsavedChanges: false,
  error: null,
};

// ============================================================================
// FIXED 6-AXIS RADAR CHART COMPONENT
// ============================================================================

interface RadarChartProps {
  curvedScore: number;      // Read-only, from analytics (0-100)
  competitiveness: number;  // Editable (0-100)
  independence: number;     // Editable (0-100)
  teamwork: number;         // Editable (0-100)
  performance: number;      // Editable (0-100)
  coachability: number;     // Editable (0-100)
  onAttributeChange: (attribute: string, value: number) => void;
  editable?: boolean;
}

const RadarChart: React.FC<RadarChartProps> = ({
  curvedScore,
  competitiveness,
  independence,
  teamwork,
  performance,
  coachability,
  onAttributeChange,
  editable = true,
}) => {
  // Build fixed 6-axis attributes array
  const attributes = [
    { name: 'Curved Score', value: curvedScore, editable: false },
    { name: 'Competitive', value: competitiveness, editable: true, key: 'competitiveness' },
    { name: 'Independence', value: independence, editable: true, key: 'independence' },
    { name: 'Teamwork', value: teamwork, editable: true, key: 'teamwork' },
    { name: 'Performance', value: performance, editable: true, key: 'performance' },
    { name: 'Coachability', value: coachability, editable: true, key: 'coachability' },
  ];

  // Chart dimensions
  const size = 280;
  const center = size / 2;
  const maxRadius = 100;
  const levels = 5; // Number of concentric rings
  const numAxes = 6;

  // Calculate points for polygon
  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / numAxes - Math.PI / 2; // Start from top
    const radius = (value / 100) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Generate polygon points string
  const polygonPoints = attributes
    .map((attr, i) => {
      const point = getPoint(i, attr.value);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Generate level rings
  const levelRings = Array.from({ length: levels }, (_, i) => {
    const levelValue = ((i + 1) / levels) * 100;
    return attributes
      .map((_, attrIndex) => {
        const point = getPoint(attrIndex, levelValue);
        return `${point.x},${point.y}`;
      })
      .join(' ');
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background rings */}
        {levelRings.map((points, i) => (
          <polygon
            key={`level-${i}`}
            points={points}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {attributes.map((_, i) => {
          const point = getPoint(i, 100);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="#d1d5db"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="#f4c514"
          fillOpacity="0.3"
          stroke="#f4c514"
          strokeWidth="2"
        />

        {/* Data points */}
        {attributes.map((attr, i) => {
          const point = getPoint(i, attr.value);
          return (
            <circle
              key={`point-${i}`}
              cx={point.x}
              cy={point.y}
              r="6"
              fill={attr.editable ? "#f4c514" : "#6b7280"}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}

        {/* Labels */}
        {attributes.map((attr, i) => {
          const labelPoint = getPoint(i, 125);
          return (
            <text
              key={`label-${i}`}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`text-[9px] font-black uppercase ${attr.editable ? 'fill-gray-700' : 'fill-gray-400'}`}
            >
              {attr.name}
            </text>
          );
        })}
      </svg>

      {/* Attribute sliders - only for editable attributes */}
      {editable && (
        <div className="w-full mt-4 space-y-2">
          {/* Curved Score - Read Only Display */}
          <div className="flex items-center gap-2 opacity-60">
            <span className="text-[9px] font-bold text-gray-400 w-28 truncate uppercase">Curved Score</span>
            <div className="flex-1 h-1.5 bg-gray-200 rounded-lg overflow-hidden">
              <div
                className="h-full bg-gray-400 rounded-lg transition-all"
                style={{ width: `${Math.min(100, curvedScore)}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-gray-400 w-8 text-right">{Math.round(curvedScore)}</span>
          </div>

          {/* Editable Attributes */}
          {[
            { key: 'competitiveness', label: 'Competitive', value: competitiveness },
            { key: 'independence', label: 'Independence', value: independence },
            { key: 'teamwork', label: 'Teamwork', value: teamwork },
            { key: 'performance', label: 'Performance', value: performance },
            { key: 'coachability', label: 'Coachability', value: coachability },
          ].map((attr) => (
            <div key={attr.key} className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-gray-500 w-28 truncate uppercase">
                {attr.label}
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={attr.value}
                onChange={(e) => onAttributeChange(attr.key, parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#f4c514]"
              />
              <span className="text-[10px] font-black text-[#f4c514] w-8 text-right">
                {attr.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// EDITABLE NOTES COMPONENT
// ============================================================================

interface NotesEditorProps {
  notes: string;
  onNotesChange: (notes: string) => void;
}

const NotesEditor: React.FC<NotesEditorProps> = ({ notes, onNotesChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes);

  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const handleSave = () => {
    onNotesChange(localNotes);
    setIsEditing(false);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
          <i className="fas fa-sticky-note mr-1 text-[#f4c514]"></i> Notes
        </h4>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-[9px] font-bold text-gray-400 hover:text-[#f4c514] transition-colors"
          >
            <i className="fas fa-edit mr-1"></i> Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Add notes about this student..."
            className="w-full h-24 p-3 text-[11px] bg-white border border-[#ffe5a0] rounded-sm resize-none focus:outline-none focus:border-[#f4c514]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setLocalNotes(notes);
                setIsEditing(false);
              }}
              className="px-3 py-1 text-[9px] font-bold text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 text-[9px] font-black uppercase bg-[#f4c514] text-black rounded-sm hover:bg-black hover:text-[#f4c514] transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`p-3 text-[11px] bg-white border border-[#ffe5a0] rounded-sm min-h-[60px] ${notes ? 'text-gray-700' : 'text-gray-400 italic'}`}
        >
          {notes || 'No notes yet. Click edit to add notes.'}
        </div>
      )}
    </div>
  );
};

type ViewMode = 'overview' | 'students' | 'themes';

const StudentAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Load analytics - uses internal 24h cache, but can force refresh
  const loadAnalytics = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const result = await generateAnalytics(forceRefresh);
      setAnalytics(result);
      setLoading(false);
    } catch (err) {
      console.error('Error generating analytics:', err);
      setError('Failed to generate analytics');
      setLoading(false);
    }
  }, []);

  // Initial load (uses cache if available)
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Listen for sync events to refresh data
  useEffect(() => {
    const unsubscribe = subscribeSyncEvent(() => {
      console.log('StudentAnalytics: Sync event received, clearing cache and refreshing...');
      clearAnalyticsCache(); // Clear the 24h cache
      loadAnalytics(true); // Force refresh from DB
    });
    return unsubscribe;
  }, [loadAnalytics]);

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
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[9px] font-black uppercase text-black/20 tracking-tighter">Generated:</span>
            <span className="ml-2 text-[10px] font-bold text-gray-500">
              {new Date(analytics.generatedAt).toLocaleString()}
            </span>
          </div>
          <button
            onClick={() => loadAnalytics(true)}
            disabled={loading}
            className="px-3 py-2 bg-[#fff1d1] border border-[#f4c514] text-[10px] font-black uppercase tracking-wider text-gray-600 hover:bg-[#f4c514] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh data from database"
          >
            <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i>
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </button>
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
          {/* Search Column - collapses when student selected */}
          <div
            className={`shrink-0 space-y-3 transition-all duration-300 ${
              selectedStudent
                ? 'w-full lg:w-14 group'
                : 'w-full lg:w-56 xl:w-64'
            }`}
            onMouseEnter={() => selectedStudent && setSearchFocused(true)}
            onMouseLeave={() => selectedStudent && setSearchFocused(false)}
          >
            {/* Search bar container - always visible */}
            <div className="relative">
              <i className={`fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-opacity ${
                selectedStudent && !searchFocused ? 'opacity-100' : 'opacity-100'
              }`}></i>
              <input
                type="text"
                placeholder={selectedStudent && !searchFocused ? "" : "Filter students..."}
                className={`w-full bg-[#fff1d1] border border-[#f4c514] p-3 pl-10 font-bold text-gray-800 focus:outline-none text-sm capitalize placeholder:text-gray-400 transition-all duration-300 ${
                  selectedStudent && !searchFocused ? 'cursor-pointer' : ''
                }`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => !selectedStudent && setTimeout(() => setSearchFocused(false), 200)}
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

            {/* Desktop list - shows on hover when student is selected, always visible otherwise */}
            <div className={`hidden lg:block bg-[#fff1d1] border border-[#ffe5a0] rounded-sm divide-y divide-[#ffe5a0] max-h-[500px] overflow-y-auto shadow-sm transition-all duration-300 ${
              selectedStudent
                ? searchFocused
                  ? 'opacity-100 visible w-56 xl:w-64 absolute z-50'
                  : 'opacity-0 invisible h-0 overflow-hidden'
                : 'opacity-100 visible'
            }`}>
              {filteredStudents.length > 0 ? (
                filteredStudents.map(profile => (
                  <button
                    key={profile.studentId}
                    onClick={() => {
                      setSelectedStudent(profile);
                      setSearchFocused(false);
                    }}
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

          {/* Details Column - expands when student selected */}
          <div className={`transition-all duration-300 ${selectedStudent ? 'flex-1' : 'flex-1'}`}>
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
      <StudentScatterPlot
        profiles={analytics.studentProfiles}
        studentAttributesMap={analytics.studentAttributesMap}
      />

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

type ReadinessTier = 'competition-ready' | 'near-ready' | 'not-ready';

interface StudentPoint {
  profile: StudentProfile;
  tier: ReadinessTier;
  tierLabel: string;
  tierColor: string;           // Original tier-based color
  attributeScore: number;      // Weighted attribute score (0-100)
  hasAttributes: boolean;      // Whether student has saved attributes
  attributeColor: string;      // Color based on attribute quality
  compositeScore: number;      // 50% technical + 50% attributes
}

/**
 * Get color for attribute quality score (0-100)
 * Red (low) -> Yellow (medium) -> Green (high)
 * Gray for students without saved attributes
 */
function getAttributeColor(score: number, hasAttributes: boolean): string {
  if (!hasAttributes) {
    return '#9ca3af'; // Gray for no data
  }

  // Clamp score to 0-100
  const s = Math.max(0, Math.min(100, score));

  if (s < 40) {
    // Red zone (0-40): deep red to orange-red
    const t = s / 40;
    return `rgb(${Math.round(220 + t * 29)}, ${Math.round(38 + t * 77)}, ${Math.round(38 - t * 16)})`;
  } else if (s < 60) {
    // Yellow zone (40-60): orange to yellow
    const t = (s - 40) / 20;
    return `rgb(${Math.round(249 - t * 15)}, ${Math.round(115 + t * 64)}, ${Math.round(22 - t * 14)})`;
  } else {
    // Green zone (60-100): lime to green
    const t = (s - 60) / 40;
    return `rgb(${Math.round(132 - t * 98)}, ${Math.round(204 - t * 7)}, ${Math.round(22 + t * 72)})`;
  }
}

function getReadinessTier(
  profile: StudentProfile,
  attributeScore: number = 50
): { tier: ReadinessTier; label: string; color: string } {
  // Calculate composite: 50% technical + 50% attributes
  const technicalScore = profile.overallScore;
  const compositeScore = (technicalScore * 0.5) + (attributeScore * 0.5);

  const mech = profile.mechanicalScore;
  const prog = profile.programmingScore;

  // Competition Ready: composite >= 75 AND mech >= 55 AND prog >= 55
  if (compositeScore >= 75 && mech >= 55 && prog >= 55) {
    return { tier: 'competition-ready', label: 'Competition Ready', color: '#22c55e' };
  }

  // Near Ready: composite >= 60
  if (compositeScore >= 60) {
    return { tier: 'near-ready', label: 'Near Ready', color: '#eab308' };
  }

  // Not Ready: otherwise
  return { tier: 'not-ready', label: 'Not Ready', color: '#ef4444' };
}

// ============================================================================
// STUDENT SCATTER PLOT COMPONENT
// ============================================================================

const StudentScatterPlot: React.FC<{
  profiles: StudentProfile[];
  studentAttributesMap: Map<string, StudentAttributesSummary>;
}> = ({ profiles, studentAttributesMap }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hoveredStudent, setHoveredStudent] = useState<{ point: StudentPoint; x: number; y: number; showBelow: boolean } | null>(null);

  // Process students into points with tier and attribute information
  const studentPoints: StudentPoint[] = useMemo(() => {
    return profiles.map(profile => {
      const attrData = studentAttributesMap.get(profile.studentId);
      const attributeScore = attrData?.weightedAttributeScore ?? 50;
      const hasAttributes = attrData?.hasAttributes ?? false;
      const attributeColor = getAttributeColor(attributeScore, hasAttributes);
      const compositeScore = (profile.overallScore * 0.5) + (attributeScore * 0.5);

      const { tier, label, color } = getReadinessTier(profile, attributeScore);

      return {
        profile,
        tier,
        tierLabel: label,
        tierColor: color,
        attributeScore,
        hasAttributes,
        attributeColor,
        compositeScore,
      };
    });
  }, [profiles, studentAttributesMap]);

  // Calculate medians for crosshairs (using new axes: technical & readiness)
  const medians = useMemo(() => {
    if (studentPoints.length === 0) return { technical: 50, readiness: 50 };
    const techScores = studentPoints.map(p => p.profile.overallScore).sort((a, b) => a - b);
    const readinessScores = studentPoints.map(p => p.compositeScore).sort((a, b) => a - b);
    const mid = Math.floor(studentPoints.length / 2);
    return {
      technical: studentPoints.length % 2 === 0
        ? (techScores[mid - 1] + techScores[mid]) / 2
        : techScores[mid],
      readiness: studentPoints.length % 2 === 0
        ? (readinessScores[mid - 1] + readinessScores[mid]) / 2
        : readinessScores[mid],
    };
  }, [studentPoints]);

  // Tier counts for legend
  const tierCounts = useMemo(() => {
    const counts = { 'competition-ready': 0, 'near-ready': 0, 'not-ready': 0 };
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

  // Axis range: 30-80 (instead of 0-100)
  const AXIS_MIN = 30;
  const AXIS_MAX = 80;
  const AXIS_RANGE = AXIS_MAX - AXIS_MIN;

  // Fixed axes: 30-80 for both
  const xScale = (value: number) => {
    const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, value));
    return padding.left + ((clamped - AXIS_MIN) / AXIS_RANGE) * graphWidth;
  };
  const yScale = (value: number) => {
    const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, value));
    return padding.top + graphHeight - ((clamped - AXIS_MIN) / AXIS_RANGE) * graphHeight;
  };

  // Point size calculation with non-linear scale
  const MIN_RADIUS = 12;
  const MAX_RADIUS = 32;

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

    // Clamp tooltip position to stay within container bounds
    const tooltipWidth = 220;
    const tooltipHeight = 280; // Increased for all the new fields

    // Horizontal bounds
    if (x - tooltipWidth / 2 < 0) {
      x = tooltipWidth / 2 + 10;
    } else if (x + tooltipWidth / 2 > containerRect.width) {
      x = containerRect.width - tooltipWidth / 2 - 10;
    }

    // Vertical bounds - check if tooltip would go above container
    const circleTop = circleRect.top - containerRect.top;
    const circleBottom = circleRect.bottom - containerRect.top;

    let y: number;
    let showBelow = false;

    // If not enough space above, show below the point
    if (circleTop - tooltipHeight - 15 < 0) {
      y = circleBottom + 15; // Position below the circle
      showBelow = true;
    } else {
      y = circleTop - 15; // Position above the circle
      showBelow = false;
    }

    setHoveredStudent({ point, x, y, showBelow });
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
            Competition Readiness Map
          </h3>
          <p className="text-[16px] text-gray-500 mt-1 pl-4">
            X = Technical Score | Y = Readiness (Tech + Attributes) | Color = Attribute Quality
          </p>
        </div>

        {/* Legend - Attribute Quality + Point Size */}
        <div className="flex flex-col gap-2">
          {/* Color legend */}
          <div className="flex flex-wrap gap-3 text-[16px]">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#22c55e]"></span>
              <span className="font-bold text-gray-600">High Attr (70+)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#eab308]"></span>
              <span className="font-bold text-gray-600">Medium (50-70)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ef4444]"></span>
              <span className="font-bold text-gray-600">Low (&lt;50)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#9ca3af] opacity-50" style={{ border: '1px dashed #6b7280' }}></span>
              <span className="font-bold text-gray-600">No Data ({studentPoints.filter(p => !p.hasAttributes).length})</span>
            </div>
          </div>
          {/* Point size legend */}
          <div className="flex items-center gap-2 text-[14px]">
            <span className="font-bold text-gray-500">Size =</span>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              <span className="text-gray-400 text-[12px]">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full bg-gray-400"></span>
              <span className="text-gray-400 text-[12px]">Med</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-gray-400"></span>
              <span className="text-gray-400 text-[12px]">High</span>
            </div>
            <span className="font-bold text-gray-500 ml-1">Technical Score</span>
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
            x1={xScale(medians.technical)} y1={padding.top}
            x2={xScale(medians.technical)} y2={height - padding.bottom}
            stroke="#6b7280" strokeWidth="2" strokeDasharray="8,6" opacity="0.7"
          />
          <line
            x1={padding.left} y1={yScale(medians.readiness)}
            x2={width - padding.right} y2={yScale(medians.readiness)}
            stroke="#6b7280" strokeWidth="2" strokeDasharray="8,6" opacity="0.7"
          />

          {/* X-axis labels - 30-80 range */}
          {[30, 40, 50, 60, 70, 80].map(v => (
            <text key={`x-${v}`} x={xScale(v)} y={height - padding.bottom + 25} textAnchor="middle" className="text-[14px] fill-gray-500 font-bold">
              {v}
            </text>
          ))}
          <text x={width / 2} y={height - 15} textAnchor="middle" className="text-[16px] fill-gray-700 font-black uppercase">
            Technical Score
          </text>

          {/* Y-axis labels - 30-80 range */}
          {[30, 40, 50, 60, 70, 80].map(v => (
            <text key={`y-${v}`} x={padding.left - 15} y={yScale(v) + 5} textAnchor="end" className="text-[14px] fill-gray-500 font-bold">
              {v}
            </text>
          ))}
          <text x={25} y={height / 2} textAnchor="middle" transform={`rotate(-90, 25, ${height / 2})`} className="text-[16px] fill-purple-600 font-black uppercase">
            Readiness Score
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
                cx={xScale(point.profile.overallScore) + jitterX}
                cy={yScale(point.compositeScore) + jitterY}
                r={isHovered ? r + 3 : r}
                fill={point.attributeColor}
                fillOpacity={point.hasAttributes ? 0.85 : 0.5}
                stroke={isHovered ? '#000' : 'white'}
                strokeWidth={isHovered ? 3 : 2}
                strokeDasharray={point.hasAttributes ? undefined : '3,2'}
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
              transform: hoveredStudent.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              minWidth: '200px',
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
                <span className="text-gray-400">Technical:</span>
                <span className="font-bold">{Math.round(hoveredStudent.point.profile.overallScore)}</span>
              </div>
              <div className="pt-1.5 border-t border-white/20 mt-1.5 space-y-1.5">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Attributes:</span>
                  <span className="font-bold" style={{ color: hoveredStudent.point.attributeColor }}>
                    {hoveredStudent.point.hasAttributes
                      ? Math.round(hoveredStudent.point.attributeScore)
                      : 'No Data'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Composite:</span>
                  <span className="font-bold text-purple-400">{Math.round(hoveredStudent.point.compositeScore)}</span>
                </div>
              </div>
              <div className="flex justify-between gap-4 pt-1.5 border-t border-white/20 mt-1.5">
                <span className="text-gray-400">Tier:</span>
                <span className="font-black" style={{ color: hoveredStudent.point.tierColor }}>{hoveredStudent.point.tierLabel}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick stats below chart */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="bg-green-50 border border-green-200 p-2 rounded">
          <div className="text-lg font-black text-green-600">{tierCounts['competition-ready']}</div>
          <div className="text-[8px] uppercase font-bold text-green-700">Competition Ready</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 p-2 rounded">
          <div className="text-lg font-black text-yellow-600">{tierCounts['near-ready']}</div>
          <div className="text-[8px] uppercase font-bold text-yellow-700">Near Ready</div>
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
    let x = circleRect.left + circleRect.width / 2 - containerRect.left;
    const y = circleRect.bottom - containerRect.top + 8; // 8px below the circle

    //clamp tooltip to stay within container bounds
    const tooltipWidth = 180;
    // Horizontal bounds
    if (x - tooltipWidth / 2 < 0) {
      x = tooltipWidth / 2 + 10;
    } else if (x + tooltipWidth / 2 > containerRect.width) {
      x = containerRect.width - tooltipWidth / 2 - 10;
    }
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
        <table className="w-full text-[16px]">
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
                  <td className="py-2 flex items-center gap-1">
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
// STUDENT PROFILE CARD (with lazy loading from database)
// ============================================================================

const StudentProfileCard: React.FC<{
  profile: StudentProfile;
  onClose: () => void;
}> = ({ profile, onClose }) => {
  // State for database-backed attributes
  const [attributesState, setAttributesState] = useState<StudentAttributesState>(DEFAULT_ATTRIBUTES_STATE);
  const [isSaving, setIsSaving] = useState(false);

  // Lazy load attributes when student profile is selected
  useEffect(() => {
    const fetchAttributes = async () => {
      setAttributesState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const data = await loadStudentAttributes(profile.studentId);

        if (data) {
          setAttributesState({
            competitiveness: data.competitiveness,
            independence: data.independence,
            teamwork: data.teamwork,
            performance: data.performance,
            coachability: data.coachability,
            comments: data.comments,
            isLoading: false,
            hasUnsavedChanges: false,
            error: null,
          });
        } else {
          // Use defaults for students without saved attributes
          setAttributesState({
            ...DEFAULT_ATTRIBUTES_STATE,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error('Failed to load student attributes:', error);
        setAttributesState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load attributes',
        }));
      }
    };

    fetchAttributes();
  }, [profile.studentId]);

  // Handle attribute slider changes
  const handleAttributeChange = (attribute: string, value: number) => {
    setAttributesState(prev => ({
      ...prev,
      [attribute]: value,
      hasUnsavedChanges: true,
    }));
  };

  // Handle comments changes
  const handleNotesChange = (comments: string) => {
    setAttributesState(prev => ({
      ...prev,
      comments,
      hasUnsavedChanges: true,
    }));
  };

  // Save attributes to database
  const handleSaveAttributes = async () => {
    setIsSaving(true);

    try {
      await saveStudentAttributes(profile.studentId, {
        competitiveness: attributesState.competitiveness,
        independence: attributesState.independence,
        teamwork: attributesState.teamwork,
        performance: attributesState.performance,
        coachability: attributesState.coachability,
        comments: attributesState.comments,
      });

      setAttributesState(prev => ({ ...prev, hasUnsavedChanges: false }));
    } catch (error) {
      console.error('Failed to save attributes:', error);
      // Keep hasUnsavedChanges true so user can retry
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* Radar Chart + Performance Line Graph - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Radar Chart Section */}
        <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest border-l-4 border-[#f4c514] pl-3 italic">
              Student Attributes
            </h3>
            {attributesState.hasUnsavedChanges && (
              <span className="text-[9px] text-orange-500 font-bold animate-pulse">Unsaved changes</span>
            )}
          </div>

          {attributesState.isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-[#f4c514] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : attributesState.error ? (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">
              {attributesState.error}
            </div>
          ) : (
            <>
              <RadarChart
                curvedScore={profile.overallScore}
                competitiveness={attributesState.competitiveness}
                independence={attributesState.independence}
                teamwork={attributesState.teamwork}
                performance={attributesState.performance}
                coachability={attributesState.coachability}
                onAttributeChange={handleAttributeChange}
                editable={true}
              />

              {/* Notes Section */}
              <NotesEditor notes={attributesState.comments} onNotesChange={handleNotesChange} />

              {/* Save Button */}
              <button
                onClick={handleSaveAttributes}
                disabled={!attributesState.hasUnsavedChanges || isSaving}
                className={`w-full mt-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-sm ${
                  attributesState.hasUnsavedChanges
                    ? 'bg-[#f4c514] text-black hover:bg-black hover:text-[#f4c514] cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save mr-2"></i>
                    Save Data
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Performance Line Graph */}
        <PerformanceLineGraph themeScores={profile.themeScores} />
      </div>
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
