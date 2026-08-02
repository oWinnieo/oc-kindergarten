import assert from 'node:assert/strict';

import { validateDeploymentEnvironment } from './validate-deployment-environment.mjs';

const validDev = {
  NODE_ENV: 'production',
  KINDERGARTEN_ENV: 'dev',
  NEXT_PUBLIC_KINDERGARTEN_ENV: 'dev',
  COMPOSE_PROJECT_NAME: 'oc-kindergarten-dev',
  APP_IMAGE: 'oc-kindergarten:dev',
  MIGRATOR_IMAGE: 'oc-kindergarten-migrator:dev',
  POSTGRES_DATA_DIR: '/opt/persist/oc-kindergarten/dev/postgres',
  EXPECTED_PUBLIC_ORIGIN: 'https://kindergarten-dev.rococo.dev',
  NEXTAUTH_URL: 'https://kindergarten-dev.rococo.dev',
  BETA_COHORT: 'private-beta-2026',
  HOST_PORT: '3108',
  POSTGRES_DB: 'oc_kindergarten',
  DATABASE_URL: 'postgresql://user:secret@postgres:5432/oc_kindergarten',
};

assert.equal(validateDeploymentEnvironment(validDev).environmentName, 'dev');

for (const overrides of [
  { KINDERGARTEN_ENV: 'prod' },
  { COMPOSE_PROJECT_NAME: 'oc-kindergarten-prod' },
  { POSTGRES_DATA_DIR: '/opt/persist/oc-kindergarten/postgres' },
  { EXPECTED_PUBLIC_ORIGIN: 'https://kindergarten.rococo.dev' },
  { APP_IMAGE: 'oc-kindergarten:latest' },
  { DATABASE_URL: 'postgresql://user:secret@db.example.com/oc_kindergarten' },
]) {
  assert.throws(() => validateDeploymentEnvironment({ ...validDev, ...overrides }));
}

const validProd = {
  ...validDev,
  KINDERGARTEN_ENV: 'prod',
  NEXT_PUBLIC_KINDERGARTEN_ENV: 'prod',
  COMPOSE_PROJECT_NAME: 'oc-kindergarten-prod',
  APP_IMAGE: 'oc-kindergarten:prod',
  MIGRATOR_IMAGE: 'oc-kindergarten-migrator:prod',
  POSTGRES_DATA_DIR: '/opt/persist/oc-kindergarten/prod/postgres',
  EXPECTED_PUBLIC_ORIGIN: 'https://kindergarten.rococo.dev',
  NEXTAUTH_URL: 'https://kindergarten.rococo.dev',
  HOST_PORT: '3208',
};
assert.equal(validateDeploymentEnvironment(validProd).environmentName, 'prod');

process.stdout.write('Deployment environment guard regression passed\n');
