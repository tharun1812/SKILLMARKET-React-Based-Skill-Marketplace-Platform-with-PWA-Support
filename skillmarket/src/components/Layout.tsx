import { Download, Inbox, LayoutDashboard, Layers, LogOut, Search, WifiOff } from 'lucide-react';
import { useCallback } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useApp } from '../context/useApp';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { useLoad } from '../lib/useLoad';
import { useOnline } from '../lib/useOnline';
import PageTransition from './PageTransition';
import { Avatar } from './ui';
import { buttonClass } from './styles';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`;

export default function Layout() {
  const { user, profile, signOut, service } = useApp();
  const online = useOnline();
  const { canInstall, install } = useInstallPrompt();
  const navigate = useNavigate();
  const location = useLocation();

  const userId = user?.id;
  const loadPending = useCallback(async () => {
    if (!userId) return 0;
    try { return (await service.listRequests()).incoming.filter((r) => r.status === 'pending').length; } catch { return 0; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, userId, location.pathname]);
  const pending = useLoad(loadPending).data ?? 0;

  async function logout() {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  }

  const tabs = [
    { to: '/marketplace', label: 'Marketplace', icon: Search },
    { to: '/my-skills', label: 'My skills', icon: Layers },
    { to: '/requests', label: 'Requests', icon: Inbox, badge: pending },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-slate-800 px-4 py-2 text-sm text-white">
          <WifiOff className="h-4 w-4" aria-hidden="true" /> You are offline. Saved pages still work, but changes need a connection.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-800">
            <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm text-white">SM</span>
            SkillMarket
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <NavLink to="/marketplace" className={linkClass}>Marketplace</NavLink>
            {user && (
              <>
                <NavLink to="/my-skills" className={linkClass}>My skills</NavLink>
                <NavLink to="/requests" className={linkClass}>
                  Requests{pending > 0 && <span className="ml-1.5 rounded-full bg-spark-800 px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`${pending} pending`}>{pending}</span>}
                </NavLink>
                <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
              </>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {canInstall && (
              <button type="button" onClick={install} className={buttonClass('secondary')}><Download className="h-4 w-4" aria-hidden="true" />Install app</button>
            )}
            {user ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100" aria-label="Your profile">
                  <Avatar name={profile?.full_name ?? user.email} size="sm" />
                  <span className="hidden max-w-[9rem] truncate text-sm font-semibold lg:inline">{profile?.full_name ?? user.email}</span>
                </Link>
                <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Sign out"><LogOut className="h-5 w-5" aria-hidden="true" /></button>
              </>
            ) : (
              <>
                <Link to="/login" className={buttonClass('ghost')}>Sign in</Link>
                <Link to="/register" className={buttonClass()}>Join free</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-24 md:pb-10">
        <PageTransition key={location.pathname}><Outlet /></PageTransition>
      </main>

      {user && (
        <nav aria-label="Main (mobile)" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {tabs.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-slate-500'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />{label}
              {badge ? <span className="absolute right-6 top-1 rounded-full bg-spark-800 px-1.5 text-[10px] font-bold text-white">{badge}</span> : null}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
