/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const fs = require('fs').promises;
const path = require('path');
const {promisify} = require('util');
const execAsync = promisify(require('child_process').exec);

const log = require('lighthouse-logger');
const rimraf = promisify(require('rimraf'));
const makeDir = require('make-dir');

const assetSaver = require('../../../lighthouse-core/lib/asset-saver.js');
const LocalConsole = require('./local-console.js');
const ChildProcessError = require('./child-process-error.js');

/**
 * Launch Chrome and do a full Lighthouse run via the CLI.
 * @param {string} url
 * @param {LH.Config.Json=} configJson
 * @param {{isDebug?: boolean}=} testRunnerOptions
 * @return {Promise<{lhr: LH.Result, artifacts: LH.Artifacts, log: string}>}
 */
async function runLighthouse(url, configJson, testRunnerOptions = {}) {
  const randInt = Math.round(Math.random() * 100000);
  const tmpAbsolutePath = await makeDir(`./.tmp/smokehouse-${randInt}/`);
  const tmpPath = path.relative(process.cwd(), tmpAbsolutePath);

  const {isDebug} = testRunnerOptions;
  return internalRun(url, tmpPath, configJson, isDebug)
    // Wait for internalRun() before rimraffing scratch directory.
    .finally(() => !isDebug && rimraf(tmpPath));
}

/**
 * Internal runner.
 * @param {string} url
 * @param {string} tmpPath
 * @param {LH.Config.Json=} configJson
 * @param {boolean=} isDebug
 * @return {Promise<{lhr: LH.Result, artifacts: LH.Artifacts, log: string}>}
 */
async function internalRun(url, tmpPath, configJson, isDebug) {
  const localConsole = new LocalConsole();

  const outputPath = `${tmpPath}/smokehouse.report.json`;
  const artifactsDirectory = `${tmpPath}/artifacts/`;

  const args = [
    'node',
    'lighthouse-cli/index.js',
    `"${url}"`, // quoted for weird urls
    `--output-path=${outputPath}`,
    '--output=json',
    `-G=${artifactsDirectory}`,
    `-A=${artifactsDirectory}`,
    '--quiet',
    '--port=0',
  ];

  // Config can be optionally provided.
  if (configJson) {
    const configPath = `${tmpPath}/config.json`;
    await fs.writeFile(configPath, JSON.stringify(configJson));
    args.push(`--config-path=${configPath}`);
  }

  if (process.env.APPVEYOR) {
    // Appveyor is hella slow already, disable CPU throttling so we're not 16x slowdown
    // see https://github.com/GoogleChrome/lighthouse/issues/4891
    args.push('--throttling.cpuSlowdownMultiplier=1');
  }

  const command = args.join(' ');
  localConsole.log(`${log.dim}$ ${command} ${log.reset}`);

  /** @type {{stdout: string, stderr: string, code?: number}} */
  let execResult;
  try {
    execResult = await execAsync(command, {encoding: 'utf8'});
  } catch (e) {
    // exec-thrown errors have stdout, stderr, and exit code from child process.
    execResult = e;
  }

  const exitCode = execResult.code || 0;
  if (isDebug) {
    localConsole.log(`exit code ${exitCode}`);
    localConsole.log(`STDOUT: ${execResult.stdout}`);
    localConsole.log(`STDERR: ${execResult.stderr}`);
  }

  try {
    await fs.access(outputPath);
  } catch (e) {
    throw new ChildProcessError(`Lighthouse run failed to produce a report and exited with ${exitCode}.`, // eslint-disable-line max-len
        localConsole.getLog());
  }

  /** @type {LH.Result} */
  const lhr = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const artifacts = assetSaver.loadArtifacts(artifactsDirectory);

  // Output has been established as existing, so can log for debug.
  if (isDebug) {
    localConsole.log(`LHR output available at: ${outputPath}`);
    localConsole.log(`Artifacts avaiable in: ${artifactsDirectory}`);
  }

  // There should either be both an error exitCode and a lhr.runtimeError or neither.
  if (Boolean(exitCode) !== Boolean(lhr.runtimeError)) {
    const runtimeErrorCode = lhr.runtimeError && lhr.runtimeError.code;
    throw new ChildProcessError(`Lighthouse did not exit with an error correctly, exiting with ${exitCode} but with runtimeError '${runtimeErrorCode}'`, // eslint-disable-line max-len
        localConsole.getLog());
  }

  return {
    lhr,
    artifacts,
    log: localConsole.getLog(),
  };
}

module.exports = {
  runLighthouse,
};
