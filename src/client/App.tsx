import { useEffect, useState, lazy, Suspense } from 'react';
import {
  Activity,
  CalendarDays,
  Users,
  ClipboardList,
  Pill,
  CreditCard,
  BookOpen,
  LogOut,
  Menu,
  X,
  HeartPulse,
} from 'lucide-react';
import { api, ApiError, isDemo } from './api';
import {
  ErrorNotice,
  Field,
  Loading,
  MutationForm,
  ResourceState,
  RoleContext,
  ModuleContext,
  Empty,
  formText,
  useResource,
} from './components';
import { type Reference, type User } from './types';
import { QueueDisplay, VerifyCertificate } from './pages/Public';
import { GuidedTour, startTour, tourNames } from './GuidedTour';
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/Admin'));
const Queue = lazy(() => import('./pages/Queue'));
const Patients = lazy(() => import('./pages/Patients'));
const Appointments = lazy(() => import('./pages/Appointments'));
const Clinical = lazy(() => import('./pages/Clinical'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Billing = lazy(() => import('./pages/Billing'));
const Guide = lazy(() => import('./pages/Guide'));
const navigation = [
  { id: 'queue', label: 'Clinic overview', icon: Activity },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays },
  { id: 'clinical', label: 'Clinical workspace', icon: ClipboardList },
  { id: 'inventory', label: 'Dispensary', icon: Pill },
  { id: 'billing', label: 'Billing & payments', icon: CreditCard },
];
interface Bootstrap {
  user: User;
  branches: Reference[];
  rooms: Reference[];
  practitioners: Reference[];
  modules: string[];
  tenant: { id: number; tenantNumber?: number; name: string };
}
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  return (
    <main className="login">
      <section className="login-context">
        <div className="brand">
          <HeartPulse size={27} />
          Clinic<span>Care, connected.</span>
        </div>
        <div>
          <h1>
            A clear view.
            <br />A calmer clinic.
          </h1>
          <p>
            Patient arrivals, consultations, and checkout.
            <br />
            One workspace for your care team.
          </p>
        </div>
        <span className="login-footer">Clinic management system · Staff access</span>
      </section>
      <section className="login-form">
        <div>
          <h2>Welcome back</h2>
          <p>Sign in with your clinic staff account.</p>
          {isDemo && (
            <p className="demo-credentials">
              Demo accounts: admin@example.test, gp@example.test, reception@example.test,
              nurse@example.test or therapist@example.test. Password: <strong>demo</strong>. Use
              sample data only.
            </p>
          )}
          <MutationForm
            label="Sign in"
            onSubmit={async (f) => {
              const result = await api.post<{ user: User }>('/auth/login', {
                email: formText(f, 'email'),
                password: formText(f, 'password'),
              });
              api.setBranch(result.user.branchId);
              onLogin(result.user);
            }}
          >
            <Field label="Email address">
              <input name="email" type="email" autoComplete="username" required autoFocus />
            </Field>
            <Field label="Password">
              <input name="password" type="password" autoComplete="current-password" required />
            </Field>
          </MutationForm>
          <p className="login-help">Need access? Contact your clinic administrator.</p>
        </div>
      </section>
    </main>
  );
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [page, setPage] = useState(location.hash.slice(1) || 'queue');
  const [mobileNav, setMobileNav] = useState(false);
  const [error, setError] = useState('');
  const bootstrap = useResource<Bootstrap>('/bootstrap');
  const [activeBranch, setActiveBranch] = useState(user.branchId);
  const [branchRevision, setBranchRevision] = useState(0);
  const [tour, setTour] = useState<string>();
  const closeTour = () => {
    setTour(undefined);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('[data-guide="start-current-tour"]')?.focus(),
    );
  };
  useEffect(() => {
    const launch = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (
        !tourNames[next] ||
        !(
          bootstrap.data?.modules.includes(next) ||
          next === 'account' ||
          (next === 'admin' && user.role === 'ADMIN')
        )
      )
        return;
      setTour(next);
      setPage(next);
      setMobileNav(false);
      location.hash = next;
    };
    window.addEventListener('clinic:start-tour', launch);
    return () => window.removeEventListener('clinic:start-tour', launch);
  }, [bootstrap.data, user.role]);
  useEffect(() => {
    if (
      tour &&
      (tour !== page ||
        !(
          bootstrap.data?.modules.includes(tour) ||
          tour === 'account' ||
          (tour === 'admin' && user.role === 'ADMIN')
        ))
    )
      setTour(undefined);
  }, [page, tour, bootstrap.data, user.role]);
  useEffect(() => {
    if (bootstrap.data && !location.hash) setPage(bootstrap.data.modules[0] || 'guide');
  }, [bootstrap.data]);
  useEffect(() => {
    function hash() {
      setPage(location.hash.slice(1) || 'queue');
      setMobileNav(false);
    }
    window.addEventListener('hashchange', hash);
    return () => window.removeEventListener('hashchange', hash);
  }, []);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        location.hash = 'patients';
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const references = {
    rooms: bootstrap.data?.rooms || [],
    practitioners: bootstrap.data?.practitioners || [],
  };
  const branch = bootstrap.data?.branches.find((b) => b.id === activeBranch);
  const modules = bootstrap.data?.modules || [];
  const allowedNavigation = navigation.filter((n) => modules.includes(n.id));
  const permittedPage =
    ['account', 'guide'].includes(page) ||
    (page === 'admin' && user.role === 'ADMIN') ||
    allowedNavigation.some((n) => n.id === page);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <a href="#queue" className="brand">
          <HeartPulse size={26} />
          Clinic<span>Care, connected.</span>
        </a>
        <button
          className="mobile-close icon-button secondary"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <X size={20} />
        </button>
        <div className="branch-label">
          <span>Workspace</span>
          <select
            aria-label="Active branch"
            value={activeBranch}
            onChange={(e) => {
              api.setBranch(Number(e.target.value));
              setTour(undefined);
              setActiveBranch(Number(e.target.value));
              setBranchRevision((v) => v + 1);
              bootstrap.refresh();
            }}
          >
            {bootstrap.data?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <small>
            Tenant ID #{bootstrap.data?.tenant.id} · Branch ID #{activeBranch}
          </small>
        </div>
        <nav aria-label="Main navigation">
          {allowedNavigation.map((n) => (
            <a
              href={`#${n.id}`}
              key={n.id}
              className={page === n.id ? 'active' : ''}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <n.icon size={19} />
              {n.label}
            </a>
          ))}
          {user.role === 'ADMIN' && (
            <a href="#admin" className={page === 'admin' ? 'active' : ''}>
              <Users size={19} />
              Administration
            </a>
          )}
          <a href="#account" className={page === 'account' ? 'active' : ''}>
            <LogOut size={19} />
            Account security
          </a>
          <a
            href="#guide"
            className={page === 'guide' ? 'active' : ''}
            aria-current={page === 'guide' ? 'page' : undefined}
            onClick={(event) => {
              if (permittedPage && tourNames[page]) {
                event.preventDefault();
                setMobileNav(false);
                startTour(page);
              }
            }}
          >
            <BookOpen size={19} />
            User guide
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{(user.name || user.email || 'S').slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.name || user.email}</strong>
            <small>
              {user.role === 'DOCTOR' ? 'GP' : user.role?.toLowerCase().replaceAll('_', ' ')}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              try {
                await api.post('/auth/logout');
                api.setBranch(undefined);
                onLogout();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button secondary"
            aria-label="Open navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(true)}
          >
            <Menu size={22} />
          </button>
          <span>
            {navigation.find((n) => n.id === page)?.label ||
              (page === 'guide'
                ? 'User guide'
                : page === 'admin'
                  ? 'Administration'
                  : page === 'account'
                    ? 'Account security'
                    : 'Clinic workspace')}
          </span>
          <div>
            {permittedPage && tourNames[page] && (
              <button
                data-guide="start-current-tour"
                className="secondary guide-launch"
                onClick={() => startTour(page)}
              >
                User guide
              </button>
            )}
            <span className="timezone">Malaysia · MYT</span>
            <a href="#patients" className="search-shortcut">
              Find patient <kbd>Ctrl K</kbd>
            </a>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <ResourceState {...bootstrap}>
            <ModuleContext.Provider value={modules}>
              <RoleContext.Provider value={user.role}>
                <Suspense key={branchRevision} fallback={<Loading />}>
                  {!permittedPage ? (
                    <Empty
                      title="Module access restricted"
                      description="Choose an available module in the sidebar, or ask your administrator to update role access."
                    />
                  ) : page === 'guide' ? (
                    <Guide />
                  ) : page === 'account' ? (
                    <Account />
                  ) : page === 'admin' && user.role === 'ADMIN' ? (
                    <Admin
                      branches={bootstrap.data?.branches || []}
                      onBranchCreated={bootstrap.refresh}
                    />
                  ) : page === 'patients' ? (
                    <Patients />
                  ) : page === 'appointments' ? (
                    <Appointments {...references} />
                  ) : page === 'clinical' ? (
                    <Clinical practitionerId={user.id} />
                  ) : page === 'inventory' ? (
                    <Inventory />
                  ) : page === 'billing' ? (
                    <Billing practitioners={references.practitioners} />
                  ) : (
                    <Queue {...references} />
                  )}
                </Suspense>
              </RoleContext.Provider>
            </ModuleContext.Provider>
          </ResourceState>
        </main>
        <footer className="workspace-footer">
          Patient records are confidential. Access and changes are audited.
        </footer>
      </div>
      {tour && <GuidedTour key={tour} module={tour} role={user.role} onClose={closeTour} />}
    </div>
  );
}
function ClinicApp() {
  const [user, setUser] = useState<User>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (location.pathname !== '/display' && !location.pathname.startsWith('/verify'))
      api
        .get<{ user: User }>('/auth/me')
        .then((r) => setUser(r.user))
        .catch((e) => {
          if (!(e instanceof ApiError && e.status === 401)) setError(e.message);
        })
        .finally(() => setReady(true));
    else setReady(true);
  }, []);
  useEffect(() => {
    const expired = () => {
      setUser(undefined);
      setError('Your session ended. Sign in again to continue.');
    };
    window.addEventListener('clinic:session-expired', expired);
    return () => window.removeEventListener('clinic:session-expired', expired);
  }, []);
  if (location.pathname === '/display') return <QueueDisplay />;
  if (location.pathname.startsWith('/verify')) return <VerifyCertificate />;
  if (!ready)
    return (
      <main className="boot-loading">
        <Loading />
      </main>
    );
  return user ? (
    <Workspace user={user} onLogout={() => setUser(undefined)} />
  ) : (
    <>
      {error && (
        <div className="login-error">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}
      <Login onLogin={setUser} />
    </>
  );
}
export default function App() {
  return isDemo ? (
    <div className="demo-app">
      <div className="demo-banner" role="note">
        <span>
          <strong>Browser demo</strong> — sample data only, resets when tab closes.
        </span>
        <button className="secondary" onClick={() => void api.resetDemo()}>
          Reset demo
        </button>
      </div>
      <ClinicApp />
    </div>
  ) : (
    <ClinicApp />
  );
}
