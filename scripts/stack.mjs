/**
 * One command to get the whole stack running.
 *
 *   npm run stack:up
 *
 * Replaces a four-step ritual that had to be done in the right order and failed
 * confusingly when it was not: start Docker Desktop, wait for the daemon, start the
 * containers, wait for Postgres to actually accept queries, then start the app. Miss
 * the waiting and the worker boots against a database that is not listening yet; miss
 * Docker entirely and the app comes up but every page 500s.
 *
 * Steps, in order, each one waited on properly:
 *
 *   1. Docker daemon reachable — launching Docker Desktop if it is not.
 *   2. `docker compose up -d --wait` — both services healthy, not merely started.
 *   3. `prisma migrate deploy` — schema matches the checked-in migrations.
 *   4. `npm run dev:all` — web server and worker, in the foreground.
 *
 * Ctrl-C stops the app but deliberately leaves Postgres and Redis running, because
 * restarting them is slow and there is no reason to discard a warm database between
 * runs. `npm run stack:down` stops them when you actually want that.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:process';

const DAEMON_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 3_000;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);

const step = (n, text) => console.log(`\n${paint('36;1', `[${n}/4]`)} ${paint('1', text)}`);
const info = (text) => console.log(`      ${text}`);
const ok = (text) => console.log(`      ${paint('32', '\u2713')} ${text}`);
const warn = (text) => console.log(`      ${paint('33', '!')} ${text}`);

function fail(text, hint) {
  console.error(`\n${paint('31;1', 'Cannot start the stack')}: ${text}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Windows needs a shell, because `docker`, `npm` and `npx` are `.cmd` shims rather
 * than real executables. Node deprecates passing an args array *together with*
 * `shell: true` (DEP0190) since the args are concatenated rather than escaped, so the
 * invocation is pre-quoted into a single string here instead of relying on that.
 */
const needsShell = platform === 'win32';

function quoted(command, args) {
  const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
  return [command, ...args.map(quote)].join(' ');
}

/** Runs a command to completion, returning success and captured output. */
function run(command, args, { quiet = true } = {}) {
  const stdio = quiet ? 'pipe' : 'inherit';
  const result = needsShell
    ? spawnSync(quoted(command, args), { stdio, encoding: 'utf8', shell: true })
    : spawnSync(command, args, { stdio, encoding: 'utf8' });

  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

// ---------------------------------------------------------------------------
// 1. Docker daemon
// ---------------------------------------------------------------------------

const daemonReady = () => run('docker', ['info', '--format', '{{.ServerVersion}}']).ok;

/** Where Docker Desktop lives, per platform. Linux runs dockerd as a service. */
function desktopLauncher() {
  if (platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      `${process.env.LOCALAPPDATA ?? ''}\\Docker\\Docker Desktop.exe`,
    ];
    const found = candidates.find((path) => path && existsSync(path));
    return found ? { command: found, args: [] } : null;
  }
  if (platform === 'darwin') return { command: 'open', args: ['-a', 'Docker'] };
  return null;
}

async function ensureDaemon() {
  step(1, 'Docker daemon');

  if (daemonReady()) {
    ok('already running');
    return;
  }

  const launcher = desktopLauncher();
  if (!launcher) {
    fail(
      'the Docker daemon is not reachable.',
      platform === 'linux'
        ? 'Start it with:  sudo systemctl start docker'
        : 'Start Docker Desktop manually, then run this again.',
    );
  }

  info('not running — launching Docker Desktop');
  // Detached: Docker Desktop outlives this script, which is the point.
  spawn(launcher.command, launcher.args, { detached: true, stdio: 'ignore' }).unref();

  const deadline = Date.now() + DAEMON_TIMEOUT_MS;
  let waited = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    waited += POLL_INTERVAL_MS;
    if (daemonReady()) {
      ok(`ready after ${Math.round(waited / 1000)}s`);
      return;
    }
    if (waited % 15_000 === 0) info(`still waiting… ${Math.round(waited / 1000)}s`);
  }

  fail(
    `the Docker daemon did not become ready within ${DAEMON_TIMEOUT_MS / 1000}s.`,
    'Docker Desktop can take a while on a cold boot. Wait for its window to say "Engine running", then run this again.',
  );
}

// ---------------------------------------------------------------------------
// 2. Containers
// ---------------------------------------------------------------------------

function ensureServices() {
  step(2, 'PostgreSQL and Redis');
  info('docker compose up -d --wait');

  // `--wait` blocks until both health checks pass, rather than until the containers
  // merely exist — which is the difference between this working and a race.
  const result = run('docker', ['compose', 'up', '-d', '--wait']);
  if (!result.ok) {
    fail(
      'docker compose could not bring the services up.',
      `${result.out}\n\nIf a port is already taken, something else is on 5433 or 6379.`,
    );
  }

  const ps = run('docker', [
    'compose',
    'ps',
    '--format',
    '{{.Name}} {{.State}} {{.Status}}',
  ]);
  for (const line of ps.out.split('\n').filter(Boolean)) ok(line);
}

// ---------------------------------------------------------------------------
// 3. Schema
// ---------------------------------------------------------------------------

function applyMigrations() {
  step(3, 'Database schema');

  const result = run('npx', ['prisma', 'migrate', 'deploy']);
  if (!result.ok) {
    fail(
      'migrations could not be applied.',
      `${result.out}\n\nCheck DATABASE_URL in .env points at localhost:5433.`,
    );
  }

  const applied = /Applying migration/.test(result.out);
  ok(applied ? 'pending migrations applied' : 'already up to date');

  // A schema with no users means the seed has never run. Worth saying, because the
  // login screen with no accounts looks like a bug rather than an empty database.
  const users = run('docker', [
    'exec',
    'lm-postgres',
    'psql',
    '-U',
    'lm',
    '-d',
    'legal_metrology',
    '-tAc',
    'select count(*) from users',
  ]);
  if (users.ok && users.out.trim() === '0') {
    warn('no user accounts exist yet — run `npm run db:seed` to load demo data');
  }
}

// ---------------------------------------------------------------------------
// 4. Application
// ---------------------------------------------------------------------------

function startApp() {
  step(4, 'Web server and worker');
  info('npm run dev:all — Ctrl-C to stop (Postgres and Redis stay up)\n');

  const child = needsShell
    ? spawn('npm run dev:all', { stdio: 'inherit', shell: true })
    : spawn('npm', ['run', 'dev:all'], { stdio: 'inherit' });

  // Forward signals so Ctrl-C reaches `concurrently`, which shuts both processes
  // down cleanly — the worker needs that to release Chrome and its Redis locks.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', (code, signal) => {
    if (signal) process.exit(0);
    process.exit(code ?? 0);
  });
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(paint('1', '\nLegal Metrology Compliance Checker — starting local stack'));

  if (!existsSync('.env')) {
    fail(
      '.env is missing.',
      'Copy the template and fill it in:\n\n  cp .env.example .env\n\nAt minimum set DATABASE_URL, REDIS_URL and JWT_SECRET.',
    );
  }

  await ensureDaemon();
  ensureServices();
  applyMigrations();
  startApp();
}

await main();
