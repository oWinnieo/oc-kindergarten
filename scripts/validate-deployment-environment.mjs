import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizedOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP(S)`);
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin without credentials, path, query or hash`);
  }
  return url.origin;
}

function taggedForEnvironment(image, environmentName, variableName) {
  const withoutDigest = image.split('@')[0];
  if (!withoutDigest.endsWith(`:${environmentName}`)) {
    throw new Error(`${variableName} must use the :${environmentName} tag`);
  }
}

export function validateDeploymentEnvironment(environment = process.env) {
  if (required(environment, 'NODE_ENV') !== 'production') {
    throw new Error('NODE_ENV must be production');
  }
  const environmentName = required(environment, 'KINDERGARTEN_ENV');
  if (!['dev', 'prod'].includes(environmentName)) {
    throw new Error('KINDERGARTEN_ENV must be dev or prod');
  }

  const publicEnvironment = required(
    environment,
    'NEXT_PUBLIC_KINDERGARTEN_ENV',
  );
  if (publicEnvironment !== environmentName) {
    throw new Error('NEXT_PUBLIC_KINDERGARTEN_ENV must match KINDERGARTEN_ENV');
  }

  const composeProjectName = required(environment, 'COMPOSE_PROJECT_NAME');
  if (composeProjectName !== `oc-kindergarten-${environmentName}`) {
    throw new Error(
      `COMPOSE_PROJECT_NAME must be oc-kindergarten-${environmentName}`,
    );
  }

  const expectedOrigin = normalizedOrigin(
    required(environment, 'EXPECTED_PUBLIC_ORIGIN'),
    'EXPECTED_PUBLIC_ORIGIN',
  );
  const nextAuthOrigin = normalizedOrigin(
    required(environment, 'NEXTAUTH_URL'),
    'NEXTAUTH_URL',
  );
  if (expectedOrigin !== nextAuthOrigin) {
    throw new Error('NEXTAUTH_URL must match EXPECTED_PUBLIC_ORIGIN');
  }
  if (
    (environmentName === 'dev' && !expectedOrigin.includes('-dev.')) ||
    (environmentName === 'prod' && expectedOrigin.includes('-dev.'))
  ) {
    throw new Error('public origin does not match the selected environment');
  }

  const dataDirectory = required(environment, 'POSTGRES_DATA_DIR');
  const expectedDirectory = `/opt/persist/oc-kindergarten/${environmentName}/postgres`;
  if (dataDirectory !== expectedDirectory) {
    throw new Error(`POSTGRES_DATA_DIR must be ${expectedDirectory}`);
  }

  taggedForEnvironment(
    required(environment, 'APP_IMAGE'),
    environmentName,
    'APP_IMAGE',
  );
  taggedForEnvironment(
    required(environment, 'MIGRATOR_IMAGE'),
    environmentName,
    'MIGRATOR_IMAGE',
  );

  const betaCohort = required(environment, 'BETA_COHORT');
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(betaCohort)) {
    throw new Error('BETA_COHORT has an invalid format');
  }

  const hostPort = Number(required(environment, 'HOST_PORT'));
  if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) {
    throw new Error('HOST_PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = new URL(required(environment, 'DATABASE_URL'));
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  if (databaseUrl.hostname !== 'postgres') {
    throw new Error('Compose DATABASE_URL hostname must be postgres');
  }
  const configuredDatabase = required(environment, 'POSTGRES_DB');
  if (decodeURIComponent(databaseUrl.pathname.slice(1)) !== configuredDatabase) {
    throw new Error('DATABASE_URL database name must match POSTGRES_DB');
  }

  return {
    environmentName,
    composeProjectName,
    expectedOrigin,
    dataDirectory,
  };
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isMain) {
  try {
    const result = validateDeploymentEnvironment();
    process.stdout.write(
      `Deployment environment verified: ${result.environmentName} / ${result.composeProjectName}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Deployment environment rejected: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  }
}
