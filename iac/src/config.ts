import { loadDeployConfig } from "./deploy-config";

/**
 * Resolved once at module load for Alchemy stack import.
 * Prefer env (CLI injects via deployConfigToEnv). When running `alchemy deploy`
 * from iac/ with a sibling outfitting.deploy.json, that file is discovered from cwd.
 */
export const deployConfig = loadDeployConfig();

export const stackName = deployConfig.stackName;
export const kvTitle = deployConfig.kvTitle;
export const databaseName = deployConfig.databaseName;
export const privateFontsBucket = deployConfig.privateFontsBucket;
export const apiName = deployConfig.workers.api;
export const routerName = deployConfig.workers.router;
export const docsWorkerName = deployConfig.workers.docs;
export const docsAssetsName = deployConfig.workers.docsAssets;
export const installerName = deployConfig.workers.installer;
export const deployDomain = deployConfig.domain;
export const installerHosts = deployConfig.installerHosts;
export const deployDocs = deployConfig.docs;
