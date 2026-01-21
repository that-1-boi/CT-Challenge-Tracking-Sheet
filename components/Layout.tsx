
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from './logo.png';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  // Use sessionStorage to auto-logout when browser/tab closes
  const isAuthenticated = sessionStorage.getItem('classroom_auth') === 'true';

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  const navItems = [
    { path: '/', label: 'Public Display', icon: 'fa-tv', protected: false },
    { path: '/search', label: 'Student Progress', icon: 'fa-user-graduate', protected: false },
    { path: '/dashboard', label: 'Tracker Dashboard', icon: 'fa-edit', protected: true },
    { path: '/admin', label: 'Management', icon: 'fa-cog', protected: true },
    { path: '/history', label: 'Session History', icon: 'fa-history', protected: true },
    { path: '/analytics', label: 'Performance Analytics', icon: 'fa-chart-line', protected: true },
  ];

  const handleLogout = () => {
    sessionStorage.removeItem('classroom_auth');
    navigate('/'); // Redirect to public page
  };

  // Filter nav items based on authentication
  const visibleNavItems = navItems.filter(item => {
    if (isAuthenticated) return true;
    return !item.protected;
  });

  return (
    <div className="min-h-screen flex bg-white w-full overflow-x-hidden">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Logo Bar (collapsed sidebar) */}
      {isMobile && !sidebarOpen && (
        <div className="fixed top-0 left-0 w-14 h-14 bg-[#1a1a1a] z-50 flex items-center justify-center shadow-2xl">
          <div
            className="w-10 h-10 bg-black flex items-center justify-center rounded-sm overflow-hidden cursor-pointer"
            onClick={() => setSidebarOpen(true)}
          >
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          </div>
        </div>
      )}

      {/* Sidebar - full on desktop, toggleable on mobile */}
      <aside className={`
        ${isMobile
          ? `fixed h-full z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : 'fixed h-full z-50'
        }
        w-16 md:w-20 bg-[#1a1a1a] flex flex-col items-center py-6 shrink-0 shadow-2xl
      `}>
        <div className="mb-auto flex flex-col items-center gap-6 w-full px-2">
          {/* Logo */}
          <div
            className="w-12 h-12 md:w-14 md:h-14 bg-black flex items-center justify-center rounded-sm overflow-hidden shadow-inner group cursor-pointer relative"
            onClick={() => {
              if (isMobile && sidebarOpen) {
                setSidebarOpen(false);
              }
              navigate('/');
            }}
          >
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            {/* Close button overlay on mobile */}
            {isMobile && sidebarOpen && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <i className="fas fa-times text-white text-sm"></i>
              </div>
            )}
          </div>

          <nav className="flex flex-col gap-6 md:gap-8">
            {visibleNavItems.map((item) => {
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={`text-lg md:text-xl transition-all duration-300 transform hover:scale-110 flex justify-center ${location.pathname === item.path
                    ? 'text-[#f4c514]'
                    : 'text-gray-500 hover:text-white'
                    }`}
                >
                  <i className={`fas ${item.icon}`}></i>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-4 mt-auto w-full">
          <div className="vertical-text text-white text-xl md:text-3xl font-light tracking-widest opacity-90 uppercase select-none">
            {isAuthenticated ? 'Admin' : 'Public View'}
          </div>

          {/* Unified Status & Login/Logout Action Box */}
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              title="Logout"
              className="w-10 h-10 md:w-12 md:h-12 bg-[#f4c514] flex items-center justify-center text-black shadow-lg mt-1 hover:bg-white transition-all transform active:scale-90"
            >
              <i className="fas fa-sign-out-alt text-lg md:text-xl"></i>
            </button>
          ) : (
            <Link
              to="/login"
              title="Login"
              className="w-10 h-10 md:w-12 md:h-12 bg-[#f4c514] flex items-center justify-center text-black shadow-lg mt-1 hover:bg-white transition-all transform active:scale-90"
            >
              <i className="fas fa-sign-in-alt text-lg md:text-xl"></i>
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 min-h-screen bg-white w-full ${isMobile ? 'ml-0 pt-14' : 'ml-16 md:ml-20'}`}>
        <div className="w-full mx-auto p-2 sm:p-4 md:p-8 lg:p-10">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
