import { useEffect, useState, lazy, Suspense } from 'react';
import {
  Activity,
  CalendarDays,
  Users,
  ClipboardList,
  Pill,
  CreditCard,
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
import { ConfirmationProvider, useConfirm } from './Confirmation';
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/Admin'));
const Queue = lazy(() => import('./pages/Queue'));
const Patients = lazy(() => import('./pages/Patients'));
const Appointments = lazy(() => import('./pages/Appointments'));
const Clinical = lazy(() => import('./pages/Clinical'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Billing = lazy(() => import('./pages/Billing'));
const PublicRegistration = lazy(() => import('./PublicRegistration'));
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
  tenant: { id: number; tenantNumber?: number; name: string; logoDataUrl?: string | null };
}
interface ClinicBranding {
  name: string;
  logoDataUrl?: string | null;
}
function ClinicBrand({ name, logoDataUrl }: ClinicBranding) {
  return (
    <>
      {logoDataUrl ? (
        <img className="brand-logo" src={logoDataUrl} alt={`${name} logo`} />
      ) : (
        <HeartPulse size={27} aria-hidden="true" />
      )}
      <strong className="brand-name">{name}</strong>
    </>
  );
}
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [branding, setBranding] = useState<ClinicBranding>({ name: 'Clinic' });
  useEffect(() => {
    if (!isDemo) return;
    const controller = new AbortController();
    api
      .get<ClinicBranding>('/public/branding', controller.signal)
      .then(setBranding)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <main className="login">
      <section className="login-context">
        <div className={`brand clinic-brand ${branding.logoDataUrl ? 'logo-brand' : ''}`}>
          <ClinicBrand {...branding} />
        </div>
      </section>
      <section className="login-form">
        <div>
          <h1>Sign in</h1>
          {isDemo && (
            <p className="demo-credentials">
              Demo accounts: admin@example.test, gp@example.test, reception@example.test,
              nurse@example.test, therapist@example.test or cashier@example.test. Password:{' '}
              <strong>demo</strong>. Use sample data only.
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
  const homePage =
    navigation.find((entry) => bootstrap.data?.modules.includes(entry.id))?.id || 'account';
  useEffect(() => {
    const refreshAccess = () => {
      if (document.visibilityState === 'visible') bootstrap.refresh();
    };
    const timer = window.setInterval(refreshAccess, 15000);
    window.addEventListener('focus', refreshAccess);
    document.addEventListener('visibilitychange', refreshAccess);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshAccess);
      document.removeEventListener('visibilitychange', refreshAccess);
    };
  }, []);
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
    if (bootstrap.data && (!location.hash || location.hash === '#main')) setPage(homePage);
  }, [bootstrap.data, homePage]);
  useEffect(() => {
    function hash() {
      const next = location.hash.slice(1);
      if (next === 'main') return;
      setPage(next || homePage);
      setMobileNav(false);
    }
    window.addEventListener('hashchange', hash);
    return () => window.removeEventListener('hashchange', hash);
  }, [homePage]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (
        bootstrap.data?.modules.includes('patients') &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault();
        location.hash = 'patients';
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [bootstrap.data]);
  const references = {
    rooms: bootstrap.data?.rooms || [],
    practitioners: bootstrap.data?.practitioners || [],
  };
  const branch = bootstrap.data?.branches.find((b) => b.id === activeBranch);
  const modules = bootstrap.data?.modules || [];
  const allowedNavigation = navigation.filter((n) => modules.includes(n.id));
  const permittedPage =
    page === 'account' ||
    (page === 'admin' && user.role === 'ADMIN') ||
    allowedNavigation.some((n) => n.id === page);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to main content
      </a>
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <a
          href={`#${homePage}`}
          className={`brand clinic-brand ${bootstrap.data?.tenant.logoDataUrl ? 'logo-brand' : ''}`}
        >
          <ClinicBrand
            name={bootstrap.data?.tenant.name || 'Clinic'}
            logoDataUrl={bootstrap.data?.tenant.logoDataUrl}
          />
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
              (page === 'admin'
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
                  ) : page === 'account' ? (
                    <Account />
                  ) : page === 'admin' && user.role === 'ADMIN' ? (
                    <Admin
                      isSuperAdmin={bootstrap.data?.user.isSuperAdmin === true}
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
    api
      .get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) setError(e.message);
      })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const expired = () => {
      setUser(undefined);
      setError('Your session ended. Sign in again to continue.');
    };
    window.addEventListener('clinic:session-expired', expired);
    return () => window.removeEventListener('clinic:session-expired', expired);
  }, []);
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
function Application() {
  const confirm = useConfirm();
  const content =
    location.pathname === '/display' ? (
      <QueueDisplay />
    ) : location.pathname === '/register' ? (
      <Suspense fallback={<Loading />}>
        <PublicRegistration />
      </Suspense>
    ) : location.pathname.startsWith('/verify') ? (
      <VerifyCertificate />
    ) : (
      <ClinicApp />
    );
  return isDemo ? (
    <div className="demo-app">
      <div className="demo-banner" role="note">
        <span>
          <strong>Browser demo</strong> — sample data only, resets when tab closes.
        </span>
        <button
          className="secondary"
          onClick={async () => {
            if (
              await confirm({
                title: 'Reset demo?',
                message: 'Discard changes in this demo session and reload the sample data.',
                confirmLabel: 'Reset demo',
              })
            )
              await api.resetDemo();
          }}
        >
          Reset demo
        </button>
      </div>
      {content}
    </div>
  ) : (
    content
  );
}
export default function App() {
  return (
    <ConfirmationProvider>
      <Application />
    </ConfirmationProvider>
  );
}
