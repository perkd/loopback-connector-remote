# loopback-connector-remote Modernization

This document describes the modernization changes applied to bring the project up to current Node.js standards.

**Status: COMPLETED** as of May 2026.

---

## Tooling

| Area | Before | After |
|---|---|---|
| Node.js engine | `>=8` | `>=24` |
| Package manager | npm | Yarn 4.15.0 |
| Test runner | Mocha 5.2.0 via Grunt | `node --test` (built-in) |
| Coverage | none | `--experimental-test-coverage` (built-in) |
| Linter | ESLint 6.x + JSHint, legacy formats | ESLint 10.x, `eslint.config.js` flat config |
| CI | Travis CI | GitHub Actions |

Removed dependencies: `assert`, `bluebird`, `grunt`, `grunt-cli`, `grunt-mocha-test`, `mocha`, `eslint-config-loopback`.

---

## ESLint flat config (`eslint.config.js`)

Replaced `.eslintrc` with `eslint.config.js` using ESLint 10's flat config format. Minimal setup: `@eslint/js` recommended rules, Node globals, CommonJS source type. Ignores `coverage/`, `node_modules/`, `.yarn/`.

Deleted: `.eslintrc`, `.eslintignore`, `.jshintrc`, `.jshintignore`.

---

## CI (`.github/workflows/ci.yml`)

Replaced `.travis.yml` with `.github/workflows/ci.yml`. Single job on Node 24: install, lint, test. Removed `.travis.yml`, which had tested Node 8, 10, 12, and 14.

---

## Bluebird removed (`test/integration/promise-support.js`)

Previously imported Bluebird and conditionally assigned it to `global.Promise` as a fallback for pre-Node-4 environments. On Node 24 `global.Promise` is always the native implementation — the entire shim was dead code. Removed the shim functions (`setGlobalPromise`, `resetGlobalPromise`, `createUserModel`) and replaced the `assert` import with `node:assert`. Test bodies are otherwise unchanged.

---

## Test migration: Mocha → `node:test`

All five test files converted to the built-in `node:test` runner with full async/await throughout. Three non-obvious issues resolved in the process:

**`node:test` hook signature** — `node:test`'s `beforeEach` signature is `beforeEach(fn, options)`, not `beforeEach(name, fn)`. Named hooks from Mocha (e.g. `beforeEach('setup', fn)`) silently pass the string as the function argument. Fixed by removing the labels across all test files.

**`save()` callback regression** — The perkd loopback fork rewrote `PersistedModel.prototype.save` as `async function(options = {})`, which silently ignores a callback argument. Tests using `m.save(cb)` timed out. Converted to `await m.save()` throughout.

**Async server ready** — `before(function(done) { server.on('listening', done) })` converted to `before(async function() { await new Promise(resolve => server.on('listening', resolve)) })`.

**Server handler cleanup** — Added `app.locals.handler.unref()` in `test/helper.js` to prevent the test process from hanging on open server handles. Added `afterEach` hooks in `test/models-define-type.test.js` and `test/models.test.js` that call `serverApp.locals.handler.close()` to clean up between tests.

**Callback-to-async/await conversions** — All callback-based test assertions converted to async/await, including:
- `User.create({...}, cb)` → `const user = await User.create({...})`
- `user.isValid(cb)` → `const valid = await new Promise(resolve => user.isValid(resolve))`
- `context()` calls replaced with `describe()` for node:test compatibility

---

## `lib/remote-connector.js` — dead code removal

Three items removed that ESLint 10's `no-unused-vars` flagged:

- `const DAO = this.DataAccessObject = ...` → `this.DataAccessObject = function() {};`
- `const original = scope[remoteMethod.name]` — captured but never read
- `function noop() {}` — defined but never called

---

## ObjectId coercion (`lib/remote-connector.js`)

Added `coerceObjectIdArgs()`: when a remote method declares a parameter as `type: 'string'` and the caller passes a MongoDB ObjectId instance (an object with a `toHexString()` method), the arg is coerced to its hex string before invoking via strong-remoting. Plain objects without `toHexString` are left untouched and rejected by strong-remoting's type checker as before.

This fixes a bug where Mongoose ObjectId instances passed to remote methods were silently dropped because strong-remoting's `isAcceptable` check rejects non-string values for `string` params.
