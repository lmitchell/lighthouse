/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const path = require('path');
const yargs = require('yargs');
const log = require('lighthouse-logger');

const {runSmokehouse} = require('./smokehouse.js');
const {server, serverForOffline} = require('../fixtures/static-server.js');

const cliLighthouseRunner = require('./run-lighthouse-cli.js').runLighthouse;

const coreTestDefnsPath = require.resolve('./test-definitions/core-tests.js');

const runners = {
  cli: cliLighthouseRunner,
};

/* eslint-disable no-console */

/**
 * @fileoverview Run smokehouse from the command line. Run webservers,
 * smokehouse, then report on failures.
 */

/**
 * Determine batches of smoketests to run, based on the `requestedIds`.
 * @param {Array<string>} requestedIds
 * @param {Array<Smokehouse.TestDfn>} allTestDefns
 * @return {Array<Smokehouse.TestDfn>}
 */
function getDefinitionsToRun(allTestDefns, requestedIds) {
  let smokes = [];
  const usage = `    ${log.dim}yarn smoke ${allTestDefns.map(t => t.id).join(' ')}${log.reset}\n`;

  if (requestedIds.length === 0) {
    smokes = [...allTestDefns];
    console.log('Running ALL smoketests. Equivalent to:');
    console.log(usage);
  } else {
    smokes = allTestDefns.filter(test => requestedIds.includes(test.id));
    console.log(`Running ONLY smoketests for: ${smokes.map(t => t.id).join(' ')}\n`);
  }

  const unmatchedIds = requestedIds.filter(requestedId => {
    return !allTestDefns.map(t => t.id).includes(requestedId);
  });
  if (unmatchedIds.length) {
    console.log(log.redify(`Smoketests not found for: ${unmatchedIds.join(' ')}`));
    console.log(usage);
  }

  return smokes;
}

/**
 * CLI entry point.
 */
async function cli() {
  const argv = yargs
    .help('help')
    .usage('node $0 [<options>] <test-ids>')
    .example('node $0 --run-in-band pwa seo', 'run pwa and seo tests serially')
    .describe({
      'debug': 'Save test artifacts and output verbose logs',
      'jobs': 'Manually set the number of jobs to run at once. `1` runs all tests serially',
      'retries': 'The number of times to retry failing tests before accepting. Defaults to 1',
      'runner': 'The method of running Lighthouse',
      'tests-path': 'The path to a set of test definitions to run. Defaults to core smoke tests.',
    })
    .boolean(['debug'])
    .alias({
      'jobs': 'j',
    })
    .choices('runner', ['cli'])
    .default('runner', 'cli')
    .wrap(yargs.terminalWidth())
    .argv;

  // TODO: use .number() when yargs is updated
  const jobs = argv.jobs !== undefined ? Number(argv.jobs) : undefined;
  const retries = argv.retries !== undefined ? Number(argv.retries) : undefined;

  const lighthouseRunner = runners[/** @type {keyof typeof runners} */ (argv.runner)];

  // Find test definition file and filter by requestedTestIds.
  let testDefnPath = argv.testsPath || coreTestDefnsPath;
  testDefnPath = path.resolve(process.cwd(), testDefnPath);
  const requestedTestIds = argv._;
  const allTestDefns = require(testDefnPath);
  const testDefns = getDefinitionsToRun(allTestDefns, requestedTestIds);

  const options = {jobs, retries, isDebug: argv.debug, lighthouseRunner};

  let isPassing;
  try {
    server.listen(10200, 'localhost');
    serverForOffline.listen(10503, 'localhost');
    isPassing = await runSmokehouse(testDefns, options);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => serverForOffline.close(resolve));
  }

  const exitCode = Number(!isPassing);
  process.exit(exitCode);
}

cli().catch(e => {
  console.error(e);
  process.exit(1);
});
