
import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import logo from './logo.png';

const Login: React.FC = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const ADMIN_PASSWORD = 'info839';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem('classroom_auth', 'true');
      const origin = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(origin);
    } else {
      setError('Invalid Access Key');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 relative">
      {/* Back to Public View Link */}
      <Link
        to="/"
        className="absolute top-8 left-8 text-black font-black uppercase text-[14px] tracking-widest hover:text-[#f4c514] transition-colors flex items-center gap-2"
      >
        <i className="fas fa-arrow-left"></i>
        Public Access
      </Link>

      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="bg-black p-12 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border-b-8 border-[#f4c514] rounded-sm">
          <div className="mb-8 text-center">
            <div className="w-20 h-20 bg-[#f4c514] mx-auto flex items-center justify-center rounded-sm mb-6 rotate-3">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Coach <span className="text-[#f4c514]">Portal</span></h1>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2">Access Restricted to Faculty</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-[#f4c514] tracking-widest">Access Key</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-white/10 border-2 border-white/20 p-4 text-white font-bold tracking-widest focus:border-[#f4c514] focus:outline-none transition-all placeholder-white/10"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-600/20 border border-red-600 p-3 text-red-500 text-[10px] font-black uppercase text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[#f4c514] text-black p-4 font-black uppercase italic tracking-widest hover:bg-white transition-all transform hover:-translate-y-1 active:translate-y-0"
            >
              Unlock Dashboard
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/10 text-center">
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
              Cautiontape Robotics<br />
              &copy; Challenge Tracking Sheet 2025
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
