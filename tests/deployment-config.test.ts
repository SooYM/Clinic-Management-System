import { describe, expect, it } from 'vitest';
import { databaseUrl, validateDeploymentConfig } from '../src/server/deployment-config';

const production: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://clinic_app:test%2Fpassword%23value@db.internal:3306/clinic',
  DATABASE_TLS: 'true',
  APP_ORIGIN: 'https://clinic.example.invalid',
  PUBLIC_URL: 'https://clinic.example.invalid',
  DOCUMENT_SIGNING_KEY: 'test-signing-key-with-at-least-32-characters',
  PHOTO_ENCRYPTION_KEY: '6bf2d105d91de731b7a4bac96edcf3b8d78b75dce6144b649ce06ec31ee3db75',
};

describe('deployment configuration', () => {
  it.each(['prod', 'Production'])(
    'rejects misspelled NODE_ENV %s instead of bypassing production guards',
    (NODE_ENV) => {
      expect(() =>
        validateDeploymentConfig({
          DATABASE_URL: 'mysql://root:password@localhost/clinic',
          NODE_ENV,
        }),
      ).toThrow('NODE_ENV');
    },
  );
  it('accepts complete same-origin production configuration and encoded credentials', () => {
    expect(validateDeploymentConfig(production)).toEqual({
      port: 3001,
      host: '127.0.0.1',
      trustProxyHops: 0,
    });
    expect(decodeURIComponent(databaseUrl(production.DATABASE_URL!).password)).toBe(
      'test/password#value',
    );
  });
  it('supports explicit container host and bounded proxy hops', () => {
    expect(
      validateDeploymentConfig({
        ...production,
        PORT: '8443',
        HOST: '0.0.0.0',
        TRUST_PROXY_HOPS: '1',
      }),
    ).toEqual({ port: 8443, host: '0.0.0.0', trustProxyHops: 1 });
  });
  it('requires database URL even outside production', () =>
    expect(() => validateDeploymentConfig({ NODE_ENV: 'development' })).toThrow(
      'DATABASE_URL is required',
    ));
  it.each(['postgres://localhost/clinic', 'mysql://localhost/', 'not a URL'])(
    'rejects invalid database URL %s',
    (value) => expect(() => databaseUrl(value)).toThrow(),
  );
  it.each(['0', '65536', '1.5', 'invalid'])('rejects invalid port %s', (PORT) =>
    expect(() => validateDeploymentConfig({ ...production, PORT })).toThrow('PORT'),
  );
  it.each(['-1', '4', '1.5', 'true'])(
    'rejects unsafe proxy hop configuration %s',
    (TRUST_PROXY_HOPS) =>
      expect(() => validateDeploymentConfig({ ...production, TRUST_PROXY_HOPS })).toThrow(
        'TRUST_PROXY_HOPS',
      ),
  );
  it.each([
    'http://clinic.example.invalid',
    'https://clinic.example.invalid/',
    'https://clinic.example.invalid/path',
    'https://user:password@clinic.example.invalid',
    'https://clinic.example.invalid?query=1',
  ])('rejects noncanonical production origin %s', (APP_ORIGIN) =>
    expect(() => validateDeploymentConfig({ ...production, APP_ORIGIN })).toThrow('APP_ORIGIN'),
  );
  it('rejects different public verification and browser origins', () =>
    expect(() =>
      validateDeploymentConfig({ ...production, PUBLIC_URL: 'https://other.example.invalid' }),
    ).toThrow('PUBLIC_URL must match'));
  it.each([
    '',
    'short',
    'CHANGE_ME_WITH_RANDOM_32_OR_MORE_CHARACTERS',
    'REPLACE_ME_WITH_A_LONG_SIGNING_SECRET',
  ])('rejects missing weak or placeholder signing configuration', (DOCUMENT_SIGNING_KEY) =>
    expect(() => validateDeploymentConfig({ ...production, DOCUMENT_SIGNING_KEY })).toThrow(
      'DOCUMENT_SIGNING_KEY',
    ),
  );
  it('accepts missing photo key when the photo module is retired', () =>
    expect(() =>
      validateDeploymentConfig({ ...production, PHOTO_ENCRYPTION_KEY: '' }),
    ).not.toThrow());
  it.each(['11'.repeat(31), 'gg'.repeat(32), `${'11'.repeat(32)}extra`])(
    'rejects invalid photo key',
    (PHOTO_ENCRYPTION_KEY) =>
      expect(() => validateDeploymentConfig({ ...production, PHOTO_ENCRYPTION_KEY })).toThrow(
        'PHOTO_ENCRYPTION_KEY',
      ),
  );
  it.each([
    'mysql://root:password@db/clinic',
    'mysql://clinic_app:CHANGE_ME@db/clinic',
    'mysql://clinic_app@db/clinic',
    'mysql://db/clinic',
  ])('rejects unsafe production database credentials', (DATABASE_URL) =>
    expect(() => validateDeploymentConfig({ ...production, DATABASE_URL })).toThrow(
      'dedicated non-root',
    ),
  );
  it('rejects implicit plaintext database transport in production', () =>
    expect(() => validateDeploymentConfig({ ...production, DATABASE_TLS: 'false' })).toThrow(
      'Production requires DATABASE_TLS',
    ));
  it('permits plaintext only when private-network exception is explicit', () =>
    expect(
      validateDeploymentConfig({
        ...production,
        DATABASE_TLS: 'false',
        ALLOW_PRIVATE_DATABASE_PLAINTEXT: 'true',
      }).port,
    ).toBe(3001));
  it('rejects misspelled TLS flag', () =>
    expect(() => validateDeploymentConfig({ ...production, DATABASE_TLS: 'yes' })).toThrow(
      'DATABASE_TLS must be',
    ));
  it('rejects CA path without TLS', () =>
    expect(() =>
      validateDeploymentConfig({
        ...production,
        DATABASE_TLS: 'false',
        DATABASE_TLS_CA_FILE: '/run/secrets/mysql-ca.pem',
      }),
    ).toThrow('DATABASE_TLS_CA_FILE requires'));
});
