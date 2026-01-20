import React, { useState, useEffect, useRef } from 'react';
import { AppState, Theme, Student, ThemeCategory } from '../types';
import { loadState, saveState, getAllStudentsFromDB, deleteStudent, deleteTheme, updateThemeCategory } from '../services/storageService';
import { DEFAULT_CLASSES } from '../constants';

const Admin: React.FC = () => {
  const [state, setState] = useState<AppState>({
    themes: [],
    currentWeekTheme: '',
    publicThemeName: '',
    publicClassId: DEFAULT_CLASSES[0].id,
    progress: {},
    selectedClassId: DEFAULT_CLASSES[0].id,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [draggedStudent, setDraggedStudent] = useState<{ studentId: string; sourceClassId: string } | null>(null);
  const [dragOverClassId, setDragOverClassId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('Loading...');

  const [newStudentNames, setNewStudentNames] = useState<Record<string, string>>({});
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingThemeName, setEditingThemeName] = useState<string | null>(null);
  const [editingThemeNewName, setEditingThemeNewName] = useState<string>('');
  const [newThemeName, setNewThemeName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIdx, setActiveUploadIdx] = useState<number | null>(null);

  // Bulk assignment state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [bulkAssignMode, setBulkAssignMode] = useState(false);

  // Track total students in database for verification
  const [totalStudentsInDB, setTotalStudentsInDB] = useState<number>(0);

  useEffect(() => {
    // Load state on mount and get total student count from database
    Promise.all([loadState(), getAllStudentsFromDB()]).then(([loadedState, allStudents]) => {
      setState(loadedState);
      setTotalStudentsInDB(allStudents.length);
      setIsLoading(false);
      setSaveStatus('All changes saved');
    });
  }, []);

  useEffect(() => {
    // Save state when it changes (but not on initial load)
    if (!isLoading) {
      setSaveStatus('Saving changes...');
      saveState(state)
        .then(() => {
          setSaveStatus('All changes saved');
        })
        .catch(err => {
          console.error('Error saving state:', err);
          setSaveStatus('Error saving');
        });
    }
  }, [state, isLoading]);

  const activeTheme = state.themes.find(t => t.name === state.currentWeekTheme) || state.themes[0];

  const updateClassName = (classId: string, newName: string) => {
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => t.name === prev.currentWeekTheme
        ? { ...t, classes: t.classes.map(c => c.id === classId ? { ...c, name: newName } : c) }
        : t
      )
    }));
  };

  const handleAddStudent = (classId: string) => {
    const name = newStudentNames[classId]?.trim();
    if (!name) return;

    const newStudent: Student = { id: crypto.randomUUID(), name };

    // Add student to the "unassigned" class in ALL themes
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        classes: t.classes.map(c => {
          // Add to unassigned in all themes
          if (c.id === 'unassigned') {
            return { ...c, students: [...c.students, { ...newStudent }] };
          }
          return c;
        })
      }))
    }));

    setNewStudentNames(prev => ({ ...prev, [classId]: '' }));

    // Update total student count
    setTotalStudentsInDB(prev => prev + 1);
  };

  const updateStudentName = (classId: string, studentId: string, newName: string) => {
    // Update student name only in the CURRENT theme
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => t.name === prev.currentWeekTheme
        ? {
            ...t,
            classes: t.classes.map(c => ({
              ...c,
              students: c.students.map(s => s.id === studentId ? { ...s, name: newName } : s)
            }))
          }
        : t
      )
    }));
  };

  const startEditingTheme = (themeName: string) => {
    setEditingThemeName(themeName);
    setEditingThemeNewName(themeName);
  };

  const saveThemeName = (oldName: string) => {
    const newName = editingThemeNewName.trim();

    // Validation
    if (!newName) {
      setEditingThemeName(null);
      return;
    }

    if (newName === oldName) {
      setEditingThemeName(null);
      return;
    }

    // Check if name already exists
    if (state.themes.find(t => t.name === newName && t.name !== oldName)) {
      alert('A theme with this name already exists!');
      return;
    }

    // Update theme name everywhere
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => t.name === oldName ? { ...t, name: newName } : t),
      currentWeekTheme: prev.currentWeekTheme === oldName ? newName : prev.currentWeekTheme,
      publicThemeName: prev.publicThemeName === oldName ? newName : prev.publicThemeName,
    }));

    setEditingThemeName(null);
  };

  const cancelEditingTheme = () => {
    setEditingThemeName(null);
    setEditingThemeNewName('');
  };

  const updateThemeChallengeName = (index: number, newName: string) => {
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => t.name === prev.currentWeekTheme
        ? { ...t, challenges: t.challenges.map((ch, i) => i === index ? newName : ch) }
        : t
      )
    }));
  };

  const handleImageUpload = (index: number) => {
    setActiveUploadIdx(index);
    fileInputRef.current?.click();
  };

  const handlePasteImage = (Leeds: React.ClipboardEvent, index: number) => {
    const items = Leeds.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            setState(prev => ({
              ...prev,
              themes: prev.themes.map(t => {
                if (t.name === prev.currentWeekTheme) {
                  const newImages = [...(t.challengeImages || ['', '', '', '', ''])];
                  newImages[index] = base64String;
                  return { ...t, challengeImages: newImages };
                }
                return t;
              })
            }));
            setSaveStatus('Image pasted successfully!');
            setTimeout(() => setSaveStatus('All changes saved'), 2000);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLSelectElement> | React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file && activeUploadIdx !== null) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setState(prev => ({
          ...prev,
          themes: prev.themes.map(t => {
            if (t.name === prev.currentWeekTheme) {
              const newImages = [...(t.challengeImages || ['', '', '', '', ''])];
              newImages[activeUploadIdx] = base64String;
              return { ...t, challengeImages: newImages };
            }
            return t;
          })
        }));
        setActiveUploadIdx(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectActiveTheme = (themeName: string) => {
    setState(prev => ({ ...prev, currentWeekTheme: themeName }));
  };

  const setPublicTheme = (themeName: string) => {
    setState(prev => ({ ...prev, publicThemeName: themeName }));
  };

  // Handle theme category change
  const handleCategoryChange = async (themeName: string, category: ThemeCategory) => {
    setSaveStatus('Saving category...');

    try {
      // Immediately save to database
      await updateThemeCategory(themeName, category);

      // Update local state
      setState(prev => ({
        ...prev,
        themes: prev.themes.map(t =>
          t.name === themeName
            ? { ...t, category }
            : t
        )
      }));

      setSaveStatus('All changes saved');
    } catch (error) {
      console.error('Error updating theme category:', error);
      setSaveStatus('Error saving category');
      setTimeout(() => setSaveStatus('All changes saved'), 3000);
    }
  };

  const createNewTheme = async () => {
    const name = newThemeName.trim();
    if (!name || state.themes.find(t => t.name === name)) return;

    // Get ALL students from database (not just from current state)
    const allStudents = await getAllStudentsFromDB();

    const newThemeClasses = JSON.parse(JSON.stringify(DEFAULT_CLASSES)).map((c: any) => {
      // Put all students in "unassigned", empty for other classes
      if (c.id === 'unassigned') {
        return { ...c, students: allStudents.map(s => ({ ...s })) };
      }
      return { ...c, students: [] };
    });

    const newTheme: Theme = {
      name,
      challenges: ['Challenge 1', 'Challenge 2', 'Challenge 3', 'Challenge 4', 'Challenge 5'],
      challengeImages: ['', '', '', '', ''],
      classes: newThemeClasses
    };

    setState(prev => ({
      ...prev,
      themes: [...prev.themes, newTheme],
      currentWeekTheme: name
    }));
    setNewThemeName('');
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${studentName} from the entire database? This will remove all their progress and assignments across all themes.`)) {
      return;
    }

    try {
      await deleteStudent(studentId);

      // Remove student from all themes in state
      setState(prev => ({
        ...prev,
        themes: prev.themes.map(theme => ({
          ...theme,
          classes: theme.classes.map(cls => ({
            ...cls,
            students: cls.students.filter(s => s.id !== studentId)
          }))
        })),
        // Remove student's progress from state
        progress: Object.fromEntries(
          Object.entries(prev.progress).filter(([key]) => !key.includes(studentId))
        )
      }));

      // Update total student count
      setTotalStudentsInDB(prev => prev - 1);

      alert(`${studentName} has been deleted successfully.`);
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Failed to delete student. Please try again.');
    }
  };

  const handleDeleteTheme = async (themeName: string) => {
    if (state.themes.length <= 1) {
      alert('Cannot delete the last theme. At least one theme must exist.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete the theme "${themeName}"? This will remove all student assignments and progress for this theme.`)) {
      return;
    }

    try {
      await deleteTheme(themeName);

      // Remove theme from state
      const remainingThemes = state.themes.filter(t => t.name !== themeName);
      const newCurrentTheme = state.currentWeekTheme === themeName ? remainingThemes[0].name : state.currentWeekTheme;
      const newPublicTheme = state.publicThemeName === themeName ? remainingThemes[0].name : state.publicThemeName;

      setState(prev => ({
        ...prev,
        themes: remainingThemes,
        currentWeekTheme: newCurrentTheme,
        publicThemeName: newPublicTheme,
        // Remove theme's progress from state
        progress: Object.fromEntries(
          Object.entries(prev.progress).filter(([key]) => !key.endsWith(`_${themeName}`))
        )
      }));

      alert(`Theme "${themeName}" has been deleted successfully.`);
    } catch (error) {
      console.error('Error deleting theme:', error);
      alert('Failed to delete theme. Please try again.');
    }
  };

  // Toggle student selection for bulk operations
  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  // Bulk assign selected students to a class
  const bulkAssignToClass = (targetClassId: string) => {
    if (selectedStudents.size === 0) return;

    setState(prev => {
      const currentTheme = prev.themes.find(t => t.name === prev.currentWeekTheme);
      if (!currentTheme) return prev;

      // Collect all selected students from all classes
      const studentsToMove: Student[] = [];
      currentTheme.classes.forEach(cls => {
        cls.students.forEach(student => {
          if (selectedStudents.has(student.id)) {
            studentsToMove.push(student);
          }
        });
      });

      return {
        ...prev,
        themes: prev.themes.map(t => t.name === prev.currentWeekTheme
          ? {
              ...t,
              classes: t.classes.map(c => {
                // Remove selected students from all classes
                const filteredStudents = c.students.filter(s => !selectedStudents.has(s.id));

                // Add all selected students to target class
                if (c.id === targetClassId) {
                  return { ...c, students: [...filteredStudents, ...studentsToMove] };
                }

                return { ...c, students: filteredStudents };
              })
            }
          : t
        )
      };
    });

    // Clear selection after moving
    setSelectedStudents(new Set());
    setBulkAssignMode(false);
  };

  const handleDragStart = (e: React.DragEvent, studentId: string, sourceClassId: string) => {
    setDraggedStudent({ studentId, sourceClassId });
    e.dataTransfer.setData('text/plain', studentId);
  };

  const handleDragOver = (e: React.DragEvent, classId: string) => {
    e.preventDefault();
    if (draggedStudent && draggedStudent.sourceClassId !== classId) setDragOverClassId(classId);
  };

  const handleDrop = (e: React.DragEvent, targetClassId: string) => {
    e.preventDefault();
    setDragOverClassId(null);
    if (!draggedStudent || draggedStudent.sourceClassId === targetClassId) {
      setDraggedStudent(null);
      return;
    }
    const { studentId, sourceClassId } = draggedStudent;

    setState(prev => {
      const currentTheme = prev.themes.find(t => t.name === prev.currentWeekTheme);
      if (!currentTheme) return prev;

      const student = currentTheme.classes.find(c => c.id === sourceClassId)?.students.find(s => s.id === studentId);
      if (!student) return prev;

      // ONLY modify the current theme, leave other themes unchanged
      return {
        ...prev,
        themes: prev.themes.map(t => t.name === prev.currentWeekTheme
          ? {
            ...t,
            classes: t.classes.map(c => {
              if (c.id === sourceClassId) return { ...c, students: c.students.filter(s => s.id !== studentId) };
              if (c.id === targetClassId) return { ...c, students: [...c.students, { ...student }] };
              return c;
            })
          }
          : t // Keep other themes exactly as they are
        )
      };
    });
    setDraggedStudent(null);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="image/png,image/jpeg"
        className="hidden"
      />
      <div className="space-y-12 pb-20">
        <div className="border-b-4 border-[#f4c514] pb-4 flex items-end justify-between">
          <div>
            <h1 className="text-5xl font-extrabold text-[#333] tracking-tight uppercase italic text-shadow">Management</h1>
            <p className="text-gray-500 font-medium mt-2 uppercase tracking-widest text-sm">Classroom And Challenge</p>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${saveStatus.includes('Saving') ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span className="text-[10px] font-black uppercase text-black/40 tracking-widest">{saveStatus}</span>
          </div>
        </div>

        <div className="bg-black p-8 rounded-sm shadow-2xl flex flex-col md:flex-row items-center gap-8 border-l-[12px] border-[#f4c514]">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-600 rounded-full animate-ping"></span>
              <h2 className="text-[#f4c514] font-black uppercase text-xs tracking-[0.3em]">Live Challenge Broadcast</h2>
            </div>
            <p className="text-white text-lg font-bold">Push Progress Updates To The Public Display</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Public Challenges</label>
              <select
                value={state.publicThemeName}
                onChange={(e) => setPublicTheme(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white font-black uppercase p-3 text-sm focus:border-[#f4c514] outline-none min-w-[300px]"
              >
                {state.themes.map(t => <option key={t.name} value={t.name} className="bg-black">{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3 text-black uppercase italic">
                <span className="w-10 h-10 bg-[#f4c514] flex items-center justify-center rounded-sm"><i className="fas fa-users text-black"></i></span>
                Class: {state.currentWeekTheme}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setBulkAssignMode(!bulkAssignMode);
                  if (bulkAssignMode) {
                    setSelectedStudents(new Set());
                  }
                }}
                className={`px-4 py-2 rounded-sm text-xs font-black uppercase transition-all ${
                  bulkAssignMode
                    ? 'bg-[#f4c514] text-black hover:bg-black hover:text-[#f4c514]'
                    : 'bg-black text-[#f4c514] hover:bg-gray-800'
                }`}
              >
                <i className={`fas ${bulkAssignMode ? 'fa-times' : 'fa-check-square'} mr-2`}></i>
                {bulkAssignMode ? 'Cancel Bulk Assign' : 'Bulk Assign'}
              </button>
            </div>

            {/* Student Count Verification Panel */}
            {(() => {
              const studentsInTheme = activeTheme?.classes.reduce((sum: number, cls) => sum + cls.students.length, 0) || 0;
              const assignedStudents = activeTheme?.classes
                .filter(c => c.id !== 'unassigned')
                .reduce((sum: number, cls) => sum + cls.students.length, 0) || 0;
              const unassignedStudents = activeTheme?.classes.find(c => c.id === 'unassigned')?.students.length || 0;

              // Check if all students from DB are in this theme
              const isComplete = studentsInTheme === totalStudentsInDB;
              const isMissing = studentsInTheme < totalStudentsInDB;

              return (
                <div className="bg-white border-2 border-black/10 rounded-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-black tracking-widest">
                      <i className="fas fa-chart-pie mr-2 text-[#f4c514]"></i>
                      Student Distribution
                    </h3>
                    {totalStudentsInDB > 0 && (
                      <div className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded ${
                        isComplete
                          ? 'bg-green-100 text-green-700'
                          : isMissing
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {isComplete ? (
                          <><i className="fas fa-check-circle mr-1"></i>VERIFIED</>
                        ) : isMissing ? (
                          <><i className="fas fa-exclamation-triangle mr-1"></i>MISSING {totalStudentsInDB - studentsInTheme}</>
                        ) : (
                          <><i className="fas fa-info-circle mr-1"></i>DUPLICATE</>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-slate-50 rounded-sm border border-slate-200">
                      <div className="text-2xl font-black text-black">{assignedStudents}</div>
                      <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Assigned</div>
                    </div>
                    <div className="text-center p-3 bg-amber-50 rounded-sm border border-amber-200">
                      <div className="text-2xl font-black text-amber-700">{unassignedStudents}</div>
                      <div className="text-[9px] font-black uppercase text-amber-600 tracking-wider">Unassigned</div>
                    </div>
                    <div className="text-center p-3 bg-[#fff1d1] rounded-sm border border-[#f4c514]">
                      <div className="text-2xl font-black text-black">{studentsInTheme}</div>
                      <div className="text-[9px] font-black uppercase text-slate-600 tracking-wider">In Theme</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-sm border border-blue-200">
                      <div className="text-2xl font-black text-blue-700">{totalStudentsInDB}</div>
                      <div className="text-[9px] font-black uppercase text-blue-600 tracking-wider">In Database</div>
                    </div>
                  </div>
                  {isMissing && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-sm p-3 flex items-start gap-3">
                      <i className="fas fa-exclamation-triangle text-red-600 text-lg mt-0.5"></i>
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-black uppercase text-red-900 tracking-wide">
                          Theme Data Incomplete
                        </p>
                        <p className="text-[10px] text-red-700 leading-relaxed">
                          This theme is missing {totalStudentsInDB - studentsInTheme} student{totalStudentsInDB - studentsInTheme !== 1 ? 's' : ''} from the database.
                          This can happen when students are added after the theme was created.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete and regenerate this theme? All current assignments and progress for this theme will be lost.')) {
                              handleDeleteTheme(activeTheme?.name || '');
                            }
                          }}
                          className="mt-2 bg-red-600 text-white px-3 py-1.5 rounded text-[9px] font-black uppercase hover:bg-red-700 transition-colors"
                        >
                          <i className="fas fa-sync-alt mr-1"></i>
                          Delete & Regenerate Theme
                        </button>
                      </div>
                    </div>
                  )}
                  {studentsInTheme > totalStudentsInDB && (
                    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-sm p-3 flex items-start gap-3">
                      <i className="fas fa-info-circle text-yellow-600 text-lg mt-0.5"></i>
                      <div className="flex-1">
                        <p className="text-xs font-black uppercase text-yellow-900 tracking-wide">
                          Duplicate Students Detected
                        </p>
                        <p className="text-[10px] text-yellow-700 leading-relaxed mt-1">
                          There are {studentsInTheme - totalStudentsInDB} duplicate student entries in this theme. This shouldn't happen normally.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {bulkAssignMode && selectedStudents.size > 0 && (
              <div className="bg-[#f4c514] border-2 border-black p-4 rounded-sm shadow-lg">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-check-square text-black text-xl"></i>
                    <span className="text-black font-black uppercase text-sm">
                      {selectedStudents.size} Student{selectedStudents.size !== 1 ? 's' : ''} Selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-black uppercase">Assign to:</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          bulkAssignToClass(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="bg-white border-2 border-black text-black font-black uppercase px-3 py-2 text-xs focus:outline-none hover:bg-gray-50 cursor-pointer"
                    >
                      <option value="" disabled>Select Class Session</option>
                      {activeTheme?.classes.filter(c => c.id !== 'unassigned').map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {activeTheme?.classes.map((cls) => (
                <div
                  key={cls.id}
                  className={`border-2 rounded-sm overflow-hidden shadow-md transition-all duration-200 ${cls.id === 'unassigned' ? 'bg-slate-100 border-dashed border-slate-300' : 'bg-[#fff1d1] border-[#ffe5a0]'
                    } ${dragOverClassId === cls.id ? 'border-[#f4c514] scale-[1.02] shadow-lg !border-solid' : ''
                    }`}
                  onDragOver={(e) => handleDragOver(e, cls.id)}
                  onDragLeave={() => setDragOverClassId(null)}
                  onDrop={(e) => handleDrop(e, cls.id)}
                >
                  <div className={`px-4 py-2 flex items-center justify-between border-b ${cls.id === 'unassigned' ? 'bg-slate-200 border-slate-300' : 'bg-[#f4c514] border-black/20'
                    }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-black font-extrabold text-lg uppercase py-1">{cls.name}</span>
                      <span className={`text-xs font-black px-2 py-0.5 rounded ${
                        cls.id === 'unassigned'
                          ? 'bg-slate-300 text-slate-700'
                          : 'bg-black text-[#f4c514]'
                      }`}>
                        {cls.students.length}
                      </span>
                    </div>
                    {bulkAssignMode && cls.students.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          cls.students.forEach(s => {
                            if (!selectedStudents.has(s.id)) {
                              toggleStudentSelection(s.id);
                            }
                          });
                        }}
                        className="text-xs font-black uppercase text-black/60 hover:text-black transition-colors"
                      >
                        <i className="fas fa-check-double mr-1"></i>
                        Select All
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-3 min-h-[60px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cls.students.map((student) => {
                        const isSelected = selectedStudents.has(student.id);
                        return (
                          <div
                            key={student.id}
                            draggable={!bulkAssignMode}
                            onDragStart={(e) => !bulkAssignMode && handleDragStart(e, student.id, cls.id)}
                            className={`flex items-center justify-between bg-white/50 p-2 rounded border text-sm group transition-all hover:bg-white ${
                              bulkAssignMode
                                ? `cursor-pointer ${isSelected ? 'border-[#f4c514] border-2 bg-[#fff1d1]' : 'border-black/5 hover:border-[#f4c514]/50'}`
                                : 'cursor-grab active:cursor-grabbing border-black/5 hover:border-[#f4c514]'
                            }`}
                            onClick={() => bulkAssignMode && toggleStudentSelection(student.id)}
                          >
                            {bulkAssignMode && (
                              <div className="flex items-center justify-center w-5 h-5 mr-2 pointer-events-none">
                                <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-[#f4c514] border-black' : 'border-black/20 bg-white'
                                }`}>
                                  {isSelected && <i className="fas fa-check text-black text-[10px]"></i>}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-1 pointer-events-none">
                              {!bulkAssignMode && <i className="fas fa-grip-vertical text-black/10 group-hover:text-[#f4c514]/30"></i>}
                              {editingStudentId === student.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  className="bg-transparent border-none outline-none font-semibold text-black w-full capitalize pointer-events-auto"
                                  value={student.name}
                                  onBlur={() => setEditingStudentId(null)}
                                  onKeyDown={(e) => e.key === 'Enter' && setEditingStudentId(null)}
                                  onChange={(e) => updateStudentName(cls.id, student.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span
                                  className="font-semibold text-black cursor-text w-full pointer-events-auto capitalize"
                                  onClick={(e) => {
                                    if (!bulkAssignMode) {
                                      e.stopPropagation();
                                      setEditingStudentId(student.id);
                                    }
                                  }}
                                >
                                  {student.name}
                                </span>
                              )}
                            </div>
                            {!bulkAssignMode && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteStudent(student.id, student.name);
                                }}
                                className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 p-1"
                                title="Delete student permanently"
                              >
                                <i className="fas fa-trash text-xs"></i>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {cls.id === 'unassigned' && (
                      <div className="mt-4 pt-4 border-t border-black/5 flex gap-2">
                        <input
                          type="text"
                          value={newStudentNames[cls.id] || ''}
                          onChange={(e) => setNewStudentNames(prev => ({ ...prev, [cls.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddStudent(cls.id)}
                          placeholder="Register new student..."
                          className="flex-1 bg-white border border-black/10 px-3 py-2 text-xs font-bold capitalize text-black outline-none focus:border-[#f4c514]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddStudent(cls.id)}
                          className="bg-black text-[#f4c514] px-4 py-2 rounded-sm text-[10px] font-black uppercase hover:bg-gray-800 transition-colors"
                        >
                          Add to Database
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <h2 className="text-2xl font-bold flex items-center gap-3 text-black uppercase italic">
              <span className="w-10 h-10 bg-[#f4c514] flex items-center justify-center rounded-sm"><i className="fas fa-tasks text-black"></i></span>
              Curriculum
            </h2>

            <div className="bg-[#fff1d1] border border-[#ffe5a0] p-8 shadow-md space-y-6">
              <div className="space-y-4">
                <label className="text-xs font-extrabold text-black uppercase tracking-tighter block">Weeks</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    placeholder="New theme name..."
                    className="flex-1 bg-white border border-[#ffe5a0] px-3 py-2 text-xs font-bold capitalize text-black focus:outline-none focus:border-[#f4c514]"
                  />
                  <button type="button" onClick={createNewTheme} className="bg-black text-[#f4c514] px-4 py-2 rounded-sm text-[10px] font-black uppercase hover:bg-gray-800">Create</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.themes.map((theme) => (
                    <div key={theme.name} className={`flex items-center border rounded-sm overflow-hidden transition-all group/theme ${state.currentWeekTheme === theme.name ? 'border-black bg-[#f4c514]' : 'border-[#ffe5a0] bg-white/60'}`}>
                      {editingThemeName === theme.name ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingThemeNewName}
                          onChange={(e) => setEditingThemeNewName(e.target.value)}
                          onBlur={() => saveThemeName(theme.name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveThemeName(theme.name);
                            if (e.key === 'Escape') cancelEditingTheme();
                          }}
                          className="px-3 py-1 text-[10px] font-black uppercase bg-transparent border-none outline-none text-black w-32"
                        />
                      ) : (
                        <>
                          <span
                            className={`px-3 py-1 text-[10px] font-black uppercase cursor-pointer ${state.currentWeekTheme === theme.name ? 'text-black' : 'text-gray-600'}`}
                            onClick={() => selectActiveTheme(theme.name)}
                            onDoubleClick={() => startEditingTheme(theme.name)}
                            title="Double-click to edit"
                          >
                            {theme.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTheme(theme.name);
                            }}
                            className={`px-2 py-1 opacity-0 group-hover/theme:opacity-100 transition-opacity text-red-600 hover:text-red-800 ${state.currentWeekTheme === theme.name ? 'hover:bg-red-100' : 'hover:bg-white'}`}
                            title="Delete theme permanently"
                          >
                            <i className="fas fa-trash text-[9px]"></i>
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {activeTheme && (
                <div className="space-y-3 pt-6 border-t border-black/5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-black uppercase italic text-black">Challenges: {activeTheme.name}</h3>
                    {/* Theme Category Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Category:</span>
                      <div className="flex rounded-sm overflow-hidden border border-black/20">
                        <button
                          type="button"
                          onClick={() => handleCategoryChange(activeTheme.name, 'mechanical')}
                          className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
                            activeTheme.category === 'mechanical'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-gray-500 hover:bg-orange-50'
                          }`}
                        >
                          <i className="fas fa-cog mr-1"></i>
                          Mechanical
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCategoryChange(activeTheme.name, 'programming')}
                          className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
                            activeTheme.category === 'programming'
                              ? 'bg-blue-500 text-white'
                              : 'bg-white text-gray-500 hover:bg-blue-50'
                          }`}
                        >
                          <i className="fas fa-code mr-1"></i>
                          Programming
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {activeTheme.challenges.map((chName, idx) => {
                      const hasImage = activeTheme.challengeImages && activeTheme.challengeImages[idx];
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <button
                            onClick={() => handleImageUpload(idx)}
                            title="Upload Challenge Image"
                            className={`w-10 h-10 flex items-center justify-center border border-black/10 shrink-0 transition-colors ${hasImage ? 'bg-green-500 text-white' : 'bg-[#f4c514] text-black hover:bg-black hover:text-[#f4c514]'}`}
                          >
                            <i className={`fas ${hasImage ? 'fa-check-circle' : 'fa-image'}`}></i>
                          </button>
                          <div className="flex-1 flex items-center">
                            <span className="bg-[#f4c514] text-black w-10 h-10 flex items-center justify-center font-black border border-black/10 border-r-0 shrink-0">C{idx + 1}</span>
                            <input
                              type="text"
                              value={chName}
                              onPaste={(e) => handlePasteImage(e, idx)}
                              onChange={(e) => updateThemeChallengeName(idx, e.target.value)}
                              placeholder="Challenge name (Ctrl+V to paste image)"
                              className="flex-1 bg-white border border-black/10 p-2 h-10 text-xs font-bold focus:ring-0 outline-none text-black capitalize"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-black p-8 rounded-sm shadow-xl text-center">
              <i className="fas fa-info-circle text-[#f4c514] mb-3 text-xl"></i>
              <p className="text-white font-black uppercase text-xs italic tracking-widest">Roster Instructions</p>
              <p className="text-gray-400 text-[10px] mt-2 leading-relaxed">
                1. Add all students to the <b>Unassigned</b> pool first.<br />
                2. Drag and drop students individually OR use <b>Bulk Assign</b> to move multiple students at once.<br />
                3. Click the <b>Image</b> icon OR focus the name field and <b>Ctrl+V</b> to paste an image for each challenge.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Admin;