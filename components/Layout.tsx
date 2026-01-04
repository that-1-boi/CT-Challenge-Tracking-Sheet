
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from './logo.png';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = localStorage.getItem('classroom_auth') === 'true';

  const navItems = [
    { path: '/', label: 'Public Display', icon: 'fa-tv', protected: false },
    { path: '/search', label: 'Student Progress', icon: 'fa-user-graduate', protected: false },
    { path: '/dashboard', label: 'Tracker Dashboard', icon: 'fa-edit', protected: true },
    { path: '/admin', label: 'Management', icon: 'fa-cog', protected: true },
    { path: '/history', label: 'Session History', icon: 'fa-history', protected: true },
  ];

  const handleLogout = () => {
    localStorage.removeItem('classroom_auth');
    navigate('/'); // Redirect to public page
  };

  // Filter nav items based on authentication
  const visibleNavItems = navItems.filter(item => {
    if (isAuthenticated) return true;
    return !item.protected;
  });

  return (
    <div className="min-h-screen flex bg-white w-full overflow-x-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-20 bg-[#1a1a1a] flex flex-col items-center py-6 shrink-0 fixed h-full z-50 shadow-2xl">
        <div className="mb-auto flex flex-col items-center gap-6 w-full px-2">
          {/* Logo*/}
          <div className="w-10 h-10 md:w-14 md:h-14 bg-black flex items-center justify-center rounded-sm overflow-hidden border border-gray-800 shadow-inner group cursor-pointer" onClick={() => navigate('/')}>
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
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
      <main className="flex-1 ml-16 md:ml-20 min-h-screen bg-white w-full">
        <div className="w-full mx-auto p-4 md:p-8 lg:p-10">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
