export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
class ClinicApi {
  private csrf = '';
  private branch: number | undefined;
  private demo?: Promise<import('./demo-store').DemoClinic>;
  private demoStore() {
    if (!isDemo) throw new Error('Browser demo transport is disabled.');
    return (this.demo ??= import('./demo-store').then(
      ({ DemoClinic }) => new DemoClinic(window.sessionStorage),
    ));
  }
  async resetDemo() {
    if (!isDemo) return;
    (await this.demoStore()).reset();
    this.csrf = '';
    this.branch = undefined;
    window.location.href = '/';
  }
  setBranch(branchId?: number) {
    this.branch = branchId;
  }
  getBranch() {
    return this.branch;
  }
  url(path: string) {
    if (isDemo) return '/demo-unavailable';
    return `/api${path}${this.branch ? `${path.includes('?') ? '&' : '?'}branchId=${encodeURIComponent(this.branch)}` : ''}`;
  }
  async request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    unwrap = true,
    signal?: AbortSignal,
  ): Promise<T> {
    if (isDemo) {
      try {
        if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
        const payload = await (await this.demoStore()).request(path, method, body, this.branch);
        if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
        if (payload.csrfToken) this.csrf = payload.csrfToken;
        return (unwrap && Array.isArray(payload.data) ? payload.data : payload) as T;
      } catch (error) {
        if (error instanceof DOMException) throw error;
        const failure = error as Error & { status?: number };
        if (failure.status === 401 && path !== '/auth/login' && path !== '/auth/me')
          window.dispatchEvent(new Event('clinic:session-expired'));
        throw new ApiError(failure.message || 'Demo operation failed.', failure.status || 500);
      }
    }
    const response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
        ...(this.branch ? { 'X-Branch-ID': String(this.branch) } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
        window.dispatchEvent(new Event('clinic:session-expired'));
      const detail = Array.isArray(payload.details)
        ? payload.details
            .map(
              (d: { path?: string; message: string }) =>
                `${d.path ? `${d.path}: ` : ''}${d.message}`,
            )
            .join(' ')
        : '';
      throw new ApiError(
        [
          typeof payload.error === 'string'
            ? payload.error
            : payload.error?.message || payload.message || 'Request failed. Please try again.',
          detail,
        ]
          .filter(Boolean)
          .join(' '),
        response.status,
      );
    }
    if (payload.csrfToken) this.csrf = payload.csrfToken;
    return (unwrap && Array.isArray(payload.data) ? payload.data : payload) as T;
  }
  get<T>(path: string, signal?: AbortSignal) {
    return this.request<T>(path, 'GET', undefined, true, signal);
  }
  getPage<T>(path: string) {
    return this.request<T>(path, 'GET', undefined, false);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, 'POST', body);
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, 'PATCH', body);
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>(path, 'PUT', body);
  }
}
export const api = new ClinicApi();
