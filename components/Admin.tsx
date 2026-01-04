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
  const [newThemeName, setNewThemeName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIdx, setActiveUploadIdx] = useState<number | null>(null);

  useEffect(() => {
    // Load state on mount
    loadState().then(loadedState => {
      // Ensure all students exist in all themes
      const syncedState = syncStudentsAcrossThemes(loadedState);
      setState(syncedState);
      setIsLoading(false);
      setSaveStatus('All changes saved');
    });
  }, []);

  // Helper function to ensure all students exist in all themes
  const syncStudentsAcrossThemes = (appState: AppState): AppState => {
    // Collect all unique students across all themes
    const allStudentsMap = new Map<string, Student>();
    appState.themes.forEach(theme => {
      theme.classes.forEach(cls => {
        cls.students.forEach(student => {
          if (!allStudentsMap.has(student.id)) {
            allStudentsMap.set(student.id, student);
          }
        });
      });
    });

    const allStudents = Array.from(allStudentsMap.values());

    // For each theme, ensure all students exist somewhere
    const syncedThemes = appState.themes.map(theme => {
      // Get all student IDs currently in this theme
      const existingStudentIds = new Set<string>();
      theme.classes.forEach(cls => {
        cls.students.forEach(s => existingStudentIds.add(s.id));
      });

      // Find students that are missing from this theme
      const missingStudents = allStudents.filter(s => !existingStudentIds.has(s.id));

      // Add missing students to the unassigned class
      const syncedClasses = theme.classes.map(cls => {
        if (cls.id === 'unassigned' && missingStudents.length > 0) {
          return {
            ...cls,
            students: [...cls.students, ...missingStudents.map(s => ({ ...s }))]
          };
        }
        return cls;
      });

      return { ...theme, classes: syncedClasses };
    });

    return { ...appState, themes: syncedThemes };
  };

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

  const globalStudents = useMemo(() => {
    const map = new Map<string, Student>();
    state.themes.forEach(t => {
      t.classes.forEach(c => {
        c.students.forEach(s => map.set(s.id, s));
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [state]);

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

    // Add student to unassigned in ALL themes
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
    // Update student name across ALL themes and ALL classes
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

  const createNewTheme = () => {
    const name = newThemeName.trim();
    if (!name || state.themes.find(t => t.name === name)) return;

    // Get all unique students from across all themes
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
                  </div>

                  <div className="p-4 space-y-3 min-h-[60px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cls.students.map((student) => (
                        <div
                          key={student.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, student.id, cls.id)}
                          className="flex items-center justify-between bg-white/50 p-2 rounded border border-black/5 text-sm group transition-all hover:bg-white cursor-grab active:cursor-grabbing hover:border-[#f4c514]"
                        >
                          <div className="flex items-center gap-2 flex-1 pointer-events-none">
                            <i className="fas fa-grip-vertical text-black/10 group-hover:text-[#f4c514]/30"></i>
                            {editingStudentId === student.id ? (
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
                              <span className="font-semibold text-black cursor-text w-full pointer-events-auto capitalize" onClick={() => setEditingStudentId(student.id)}>{student.name}</span>
                            )}
                          </div>
                        </div>
                      ))}
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
                      <span
                        className={`px-3 py-1 text-[10px] font-black uppercase cursor-pointer ${state.currentWeekTheme === theme.name ? 'text-black' : 'text-gray-600'}`}
                        onClick={() => selectActiveTheme(theme.name)}
                      >
                        {theme.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {activeTheme && (
                <div className="space-y-3 pt-6 border-t border-black/5">
                  <h3 className="text-sm font-black uppercase italic text-black">Challenges: {activeTheme.name}</h3>
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
                2. Drag and drop students into their specific session times.<br />
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