/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const log = require('npmlog');
const path = require('path');
const uniq = require('lodash').uniq;
const flatten = require('lodash').flatten;
const chalk = require('chalk');

const isEmpty = require('lodash').isEmpty;
const promiseWaterfall = require('./promiseWaterfall');
const registerDependencyAndroid = require('./android/registerNativeModule');
const registerDependencyIOS = require('./ios/registerNativeModule');
const isInstalledAndroid = require('./android/isInstalled');
const isInstalledIOS = require('./ios/isInstalled');
const copyAssetsAndroid = require('./android/copyAssets');
const copyAssetsIOS = require('./ios/copyAssets');
const getProjectDependencies = require('./getProjectDependencies');
const getDependencyConfig = require('./getDependencyConfig');
const pollParams = require('./pollParams');
const commandStub = require('./commandStub');
const promisify = require('./promisify');

log.heading = 'rnpm-link';

const dedupeAssets = (assets) => uniq(assets, asset => path.basename(asset));


const linkDependencyAndroid = (androidProject, dependency) => {
  if (!androidProject || !dependency.config.android) {
    return null;
  }

  const isInstalled = isInstalledAndroid(androidProject, dependency.name);

  if (isInstalled) {
    log.info(chalk.grey(`Android module ${dependency.name} is already linked`));
    return null;
  }

  return pollParams(dependency.config.params).then(params => {
    log.info(`Linking ${dependency.name} android dependency`);

    registerDependencyAndroid(
      dependency.name,
      dependency.config.android,
      params,
      androidProject
    );

    log.info(`Android module ${dependency.name} has been successfully linked`);
  });
};

const linkDependencyIOS = (iOSProject, dependency) => {
  if (!iOSProject || !dependency.config.ios) {
    return;
  }

  const isInstalled = isInstalledIOS(iOSProject, dependency.config.ios);

  if (isInstalled) {
    log.info(chalk.grey(`iOS module ${dependency.name} is already linked`));
    return;
  }

  log.info(`Linking ${dependency.name} ios dependency`);

  registerDependencyIOS(dependency.config.ios, iOSProject);

  log.info(`iOS module ${dependency.name} has been successfully linked`);
};

const linkAssets = (project, assets) => {
  if (isEmpty(assets)) {
    return;
  }

  if (project.ios) {
    log.info('Linking assets to ios project');
    copyAssetsIOS(assets, project.ios);
  }

  if (project.android) {
    log.info('Linking assets to android project');
    copyAssetsAndroid(assets, project.android.assetsPath);
  }

  log.info('Assets have been successfully linked to your project');
};

/**
 * Updates project and linkes all dependencies to it
 *
 * If optional argument [packageName] is provided, it's the only one that's checked
 */
function link(argv, config, args) {
    var project;

    console.log(argv, args);

  try {
    project = config.getProjectConfig();
  } catch (err) {
    log.error(
      'ERRPACKAGEJSON',
      'No package found. Are you sure it\'s a React Native project?'
    );
    return Promise.reject(err);
  }

  const packageName = argv[0];
  const packageTargetIos = args.targetIos;
  const packageTargetAndroid = args.targetAndroid;

  const dependencies = getDependencyConfig(
    config,
    packageName ? [packageName] : getProjectDependencies()
  );

  if (packageTargetIos && project.ios) {
    project.ios.target = packageTargetIos;
  }

    console.log(project);


    const assets = dedupeAssets(dependencies.reduce(
    (assets, dependency) => assets.concat(dependency.config.assets),
    project.assets
  ));

  const tasks = flatten(dependencies.map(dependency => [
    () => promisify(dependency.config.commands.prelink || commandStub),
    () => linkDependencyAndroid(project.android, dependency),
    () => linkDependencyIOS(project.ios, dependency),
    () => promisify(dependency.config.commands.postlink || commandStub),
  ]));

  tasks.push(() => linkAssets(project, assets));

  return promiseWaterfall(tasks).catch(err => {
    log.error(
      `It seems something went wrong while linking. Error: ${err.message} \n`
      + 'Please file an issue here: https://github.com/facebook/react-native/issues'
    );
    throw err;
  });
}

module.exports = {
  func: link,
  description: 'links all native dependencies',
  name: 'link [packageName]',
  options: [
    {
      command: '--target-ios [string]',
      description: 'Use a specific ios project target',
    },
    {
      command: '--target-android [string]',
      description: 'Use a specific android project target',
    },
  ],
};

