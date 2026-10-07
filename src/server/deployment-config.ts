export interface DeploymentConfig {
  port: number;
  host: string;
  trustProxyHops: number;
}
const placeholder = (value: string) =>
  /^(CHANGE_ME|REPLACE_ME|YOUR_|EXAMPLE_|SAMPLE_)/i.test(value);
export function databaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid MySQL URL.');
  }
  if (url.protocol !== 'mysql:' || !url.hostname || !url.pathname.slice(1))
    throw new Error('DATABASE_URL must identify a MySQL database.');
  return url;
}
export function validateDeploymentConfig(env: NodeJS.ProcessEnv): DeploymentConfig {
  if (env.NODE_ENV !== undefined && !['development', 'test', 'production'].includes(env.NODE_ENV))
    throw new Error('NODE_ENV must be development, test, or production.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const db = databaseUrl(env.DATABASE_URL),
    port = Number(env.PORT || 3001),
    trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 3)
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 3.');
  if (env.DATABASE_TLS !== undefined && !['true', 'false'].includes(env.DATABASE_TLS))
    throw new Error('DATABASE_TLS must be true or false.');
  if (env.DATABASE_TLS_CA_FILE && env.DATABASE_TLS !== 'true')
    throw new Error('DATABASE_TLS_CA_FILE requires DATABASE_TLS=true.');
  if (env.NODE_ENV === 'production') {
    for (const field of ['APP_ORIGIN', 'PUBLIC_URL'] as const) {
      const value = env[field];
      let url: URL;
      try {
        url = new URL(value || '');
      } catch {
        throw new Error(`${field} must be an exact HTTPS origin.`);
      }
      if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password)
        throw new Error(`${field} must be an exact HTTPS origin without path or trailing slash.`);
    }
    if (env.PUBLIC_URL !== env.APP_ORIGIN)
      throw new Error('PUBLIC_URL must match APP_ORIGIN for this same-origin deployment.');
    if (
      !env.DOCUMENT_SIGNING_KEY ||
      env.DOCUMENT_SIGNING_KEY.length < 32 ||
      placeholder(env.DOCUMENT_SIGNING_KEY)
    )
      throw new Error(
        'Production requires a nonplaceholder DOCUMENT_SIGNING_KEY of at least 32 characters.',
      );
    if (env.PHOTO_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(env.PHOTO_ENCRYPTION_KEY))
      throw new Error('Production requires PHOTO_ENCRYPTION_KEY as 64 hexadecimal characters.');
    if (
      !db.username ||
      !db.password ||
      db.username.toLowerCase() === 'root' ||
      placeholder(decodeURIComponent(db.password))
    )
      throw new Error(
        'Production DATABASE_URL requires a dedicated non-root account and nonplaceholder password.',
      );
    if (env.DATABASE_TLS !== 'true' && env.ALLOW_PRIVATE_DATABASE_PLAINTEXT !== 'true')
      throw new Error(
        'Production requires DATABASE_TLS=true or explicit ALLOW_PRIVATE_DATABASE_PLAINTEXT=true for an isolated private database network.',
      );
  }
  return { port, host: env.HOST || '127.0.0.1', trustProxyHops };
}
