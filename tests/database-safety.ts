/** Integration tests may never fall back to DATABASE_URL or a clinician's database. */
export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL): string {
  if (!value) throw new Error('TEST_DATABASE_URL is required for MySQL integration tests');
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== 'mysql:' || !/(^|[_-])test([_-]|$)/i.test(database)) {
    throw new Error('TEST_DATABASE_URL must name an explicit test database');
  }
  return value;
}
