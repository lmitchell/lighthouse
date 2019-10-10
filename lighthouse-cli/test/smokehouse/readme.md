# Smokehouse

Smokehouse is the Lighthouse end-to-end/smoke test runner. It takes in a set of URLs (usually of custom-built test sites) and runs Lighthouse on them, then compares the results against an expectations file.

By default this is done using the Lighthouse CLI (to exercise the full pipeline) with the tests listed in `smokehouse/test-definitions/core-tests.js`.

## Options

See [`SmokehouseOptions`](https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-cli/test/smokehouse/smokehouse.js#L23).

## Pipeline

Frontends                                                   Runners
+------------+
|            |
|  bin (CLI) +----+                                +--------------+
|            |    |                                |              |
+------------+    |                            +-->+lighthouse-cli|
                  |                            |   |              |
+------------+    |      +---------------+     |   +--------------+
|            |    |      |               |     |
|   node     +----+----->+ smokehouse.js +-----+
|            |    |      |               |     |   +--------------+
+------------+    |      +---------------+     |   |              |
                  |                            +-->+  bundled-LH  |
+------------+    |                                |              |
|            |    |                                +--------------+
|bundle-entry+----+
|            |
+------------+

### Frontend
- `smokehouse-bin.js` - runs smokehouse from the command line
- `smokehouse.js` - smokehouse itself is runnable from node
- TODO: bundle-entry - simple entrypoint to smokehouse that serves as a bundle entry point to run it in a browser.

### Smokehouse
- `smokehouse.js` - takes a set of smoke-test definitions and runs them via a passed-in runner. If its inputs are bundleable then smokehouse is as well.

### Runner
- `run-lighthouse-cli.js` - the original smoke test runner, exercising the CLI from command-line argument parsing to the artifacts and results written to disk on completion.
- TODO: bundle runner - a smoke test runner that operates on an already-bundled version of Lighthouse for end-to-end testing of that version.

## Custom smoke tests (for plugins et al.)
Smokehouse comes with a core set of test definitions, but it can run  any set of tests. Custom extensions of Lighthouse (like plugins) can provide their own tests and run via the same infrastructure. For example:

- have a test site on a public URL or via a local server (e.g. `https://localhost:8080`)
- create a test definition (e.g. in `plugin-tests.js`)
   ```js
   const smokeTests = [{
     id: 'pluginTest',
     // config: ..., If left out, uses default LH config
     runParallel: true, // If test isn't perf-sensitive
     expectations: require('./expectations.js'),
   };
   module.exports = smokeTests;
   ```
- create a test expectations file (e.g. `expectations.js`)
   ```js
   const expectations = [{
     lhr: {
       requestedUrl: 'http://localhost:8080/index.html',
       finalUrl: 'http://localhost:8080/index.html',
       audits: {
         'preload-as': {
           score: 1,
           displayValue: /^Found 0 preload requests/,
         },
       },
     },
   };
   module.exports = expectations;
   ```
- run smokehouse

   `node lighthouse-cli/test/smokehouse/smokehouse-bin.js --tests-path plugin-tests.js`
