import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState, Theme, Student } from '../types';
import { loadState, saveState } from '../services/storageService';
import { DEFAULT_CLASSES, DEFAULT_THEMES } from '../constants';

const Admin: React.FC = () => {
  const [state, setState] = useState<AppState>({
    themes: DEFAULT_THEMES,
    currentWeekTheme: DEFAULT_THEMES[0].name,
    publicThemeName: DEFAULT_THEMES[0].name,
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

  // Multi-select state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  useEffect(() => {
    loadState().then(loadedState => {
      setState(loadedState);
      setIsLoading(false);
      setSaveStatus('All changes saved');
    });
  }, []);

  useEffect(() => {
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

  const globalStudents = useMemo(() => {
    const map = new Map<string, Student>();
    state.themes.forEach(t => {
      t.classes.forEach(c => {
        c.students.forEach(s => map.set(s.id, s));
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [state]);

  // Multi-select functions
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

  const selectAllInClass = (classId: string) => {
    const cls = activeTheme?.classes.find(c => c.id === classId);
    if (!cls) return;

    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      cls.students.forEach(s => newSet.add(s.id));
      return newSet;
    });
  };

  const deselectAll = () => {
    setSelectedStudents(new Set());
  };

  const moveSelectedStudentsToClass = (targetClassId: string) => {
    if (selectedStudents.size === 0) return;

    setState(prev => {
      const currentTheme = prev.themes.find(t => t.name === prev.currentWeekTheme);
      if (!currentTheme) return prev;

      // Find all students being moved
      const studentsToMove: { student: Student; sourceClassId: string }[] = [];
      currentTheme.classes.forEach(cls => {
        cls.students.forEach(student => {
          if (selectedStudents.has(student.id)) {
            studentsToMove.push({ student, sourceClassId: cls.id });
          }
        });
      });

      return {
        ...prev,
        themes: prev.themes.map(t => t.name === prev.currentWeekTheme
          ? {
            ...t,
            classes: t.classes.map(c => {
              // Remove selected students from their current classes
              const filtered = c.students.filter(s => !selectedStudents.has(s.id));

              // Add selected students to target class
              if (c.id === targetClassId) {
                const studentsToAdd = studentsToMove.map(item => ({ ...item.student }));
                return { ...c, students: [...filtered, ...studentsToAdd] };
              }

              return { ...c, students: filtered };
            })
          }
          : t
        )
      };
    });

    setSelectedStudents(new Set());
    setIsMultiSelectMode(false);
  };

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

    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        classes: t.classes.map(c => c.id === 'unassigned'
          ? { ...c, students: [...c.students, { ...newStudent }] }
          : c
        )
      }))
    }));

    setNewStudentNames(prev => ({ ...prev, [classId]: '' }));
  };

  const updateStudentName = (classId: string, studentId: string, newName: string) => {
    setState(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        classes: t.classes.map(c => ({
          ...c,
          students: c.students.map(s => s.id === studentId ? { ...s, name: newName } : s)
        }))
      }))
    }));
  };

  const startEditingTheme = (themeName: string) => {
    setEditingThemeName(themeName);
    setEditingThemeNewName(themeName);
  };

  const saveThemeName = (oldName: string) => {
    const newName = editingThemeNewName.trim();

    if (!newName) {
      setEditingThemeName(null);
      return;
    }

    if (newName === oldName) {
      setEditingThemeName(null);
      return;
    }

    if (state.themes.find(t => t.name === newName && t.name !== oldName)) {
      alert('A theme with this name already exists!');
      return;
    }

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

  const handlePasteImage = (e: React.ClipboardEvent, index: number) => {
    const items = e.clipboardData?.items;
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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  const createNewTheme = () => {
    const name = newThemeName.trim();
    if (!name || state.themes.find(t => t.name === name)) return;

    const allStudents = globalStudents.map(s => ({ ...s }));

    const newThemeClasses = JSON.parse(JSON.stringify(DEFAULT_CLASSES)).map((c: any) => {
      if (c.id === 'unassigned') return { ...c, students: allStudents };
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

  const handleDragStart = (e: React.DragEvent, studentId: string, sourceClassId: string) => {
    if (isMultiSelectMode) {
      e.preventDefault();
      return;
    }
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
          : t
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

        {/* Multi-Select Control Panel */}
        {isMultiSelectMode && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-sm shadow-xl border-l-[12px] border-blue-400">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <i className="fas fa-check-square text-white text-2xl"></i>
                <div>
                  <h3 className="text-white font-black uppercase text-sm">Multi-Select Mode</h3>
                  <p className="text-blue-200 text-xs">
                    {selectedStudents.size} student{selectedStudents.size !== 1 ? 's' : ''} selected
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      moveSelectedStudentsToClass(e.target.value);
                    }
                  }}
                  value=""
                  disabled={selectedStudents.size === 0}
                  className="bg-white text-black font-bold px-4 py-2 rounded-sm text-xs uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Move to class...</option>
                  {activeTheme?.classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>

                <button
                  onClick={deselectAll}
                  disabled={selectedStudents.size === 0}
                  className="bg-blue-500 text-white px-4 py-2 rounded-sm text-xs font-black uppercase hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Selection
                </button>

                <button
                  onClick={() => {
                    setIsMultiSelectMode(false);
                    setSelectedStudents(new Set());
                  }}
                  className="bg-white text-blue-600 px-4 py-2 rounded-sm text-xs font-black uppercase hover:bg-gray-100"
                >
                  Exit Multi-Select
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3 text-black uppercase italic">
                <span className="w-10 h-10 bg-[#f4c514] flex items-center justify-center rounded-sm"><i className="fas fa-users text-black"></i></span>
                Class: {state.currentWeekTheme}
              </h2>

              <button
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode);
                  if (isMultiSelectMode) {
                    setSelectedStudents(new Set());
                  }
                }}
                className={`px-4 py-2 rounded-sm text-xs font-black uppercase transition-colors ${isMultiSelectMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                <i className="fas fa-check-square mr-2"></i>
                {isMultiSelectMode ? 'Multi-Select ON' : 'Multi-Select'}
              </button>
            </div>

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
                    <span className="text-black font-extrabold text-lg uppercase py-1">{cls.name}</span>

                    {isMultiSelectMode && cls.students.length > 0 && (
                      <button
                        onClick={() => selectAllInClass(cls.id)}
                        className="text-xs font-bold uppercase text-black/60 hover:text-black underline"
                      >
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
                            draggable={!isMultiSelectMode}
                            onDragStart={(e) => handleDragStart(e, student.id, cls.id)}
                            onClick={() => isMultiSelectMode && toggleStudentSelection(student.id)}
                            className={`flex items-center justify-between p-2 rounded border text-sm group transition-all ${isMultiSelectMode
                                ? `cursor-pointer ${isSelected ? 'bg-blue-500 border-blue-600' : 'bg-white/50 border-black/5 hover:bg-blue-100 hover:border-blue-300'}`
                                : 'bg-white/50 border-black/5 hover:bg-white cursor-grab active:cursor-grabbing hover:border-[#f4c514]'
                              }`}
                          >
                            <div className="flex items-center gap-2 flex-1 pointer-events-none">
                              {isMultiSelectMode ? (
                                <i className={`fas ${isSelected ? 'fa-check-square text-white' : 'fa-square text-black/20'}`}></i>
                              ) : (
                                <i className="fas fa-grip-vertical text-black/10 group-hover:text-[#f4c514]/30"></i>
                              )}
                              {editingStudentId === student.id && !isMultiSelectMode ? (
                                <input
                                  autoFocus
                                  type="text"
                                  className="bg-transparent border-none outline-none font-semibold text-black w-full capitalize pointer-events-auto"
                                  value={student.name}
                                  onBlur={() => setEditingStudentId(null)}
                                  onKeyDown={(e) => e.key === 'Enter' && setEditingStudentId(null)}
                                  onChange={(e) => updateStudentName(cls.id, student.id, e.target.value)}
                                />
                              ) : (
                                <span
                                  className={`font-semibold w-full pointer-events-auto capitalize ${isMultiSelectMode
                                      ? (isSelected ? 'text-white' : 'text-black')
                                      : 'text-black cursor-text'
                                    }`}
                                  onClick={(e) => {
                                    if (!isMultiSelectMode) {
                                      e.stopPropagation();
                                      setEditingStudentId(student.id);
                                    }
                                  }}
                                >
                                  {student.name}
                                </span>
                              )}
                            </div>
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
                    <div key={theme.name} className={`flex items-center border rounded-sm overflow-hidden transition-all ${state.currentWeekTheme === theme.name ? 'border-black bg-[#f4c514]' : 'border-[#ffe5a0] bg-white/60'}`}>
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
                        <span
                          className={`px-3 py-1 text-[10px] font-black uppercase cursor-pointer ${state.currentWeekTheme === theme.name ? 'text-black' : 'text-gray-600'}`}
                          onClick={() => selectActiveTheme(theme.name)}
                          onDoubleClick={() => startEditingTheme(theme.name)}
                          title="Double-click to edit"