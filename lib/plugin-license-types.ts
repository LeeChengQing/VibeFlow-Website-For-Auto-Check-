export const PLUGIN_PLANS = {trial:'试用',semester_license:'学期',lifetime_license:'永久'} as const;
export type PluginPlan = keyof typeof PLUGIN_PLANS;
export type PluginIssueInput = {plan:string;expiresAt:string;maxDevices:number;note:string};
export type PluginLicenseView = {
  id:string;identifier:string;plan:PluginPlan;status:'active'|'revoked'|'expired';maxDevices:number;expiresAt:string|null;createdAt:string;note:string;
  devices:{id:string;activatedAt:string;releasedAt:string|null}[];
  events:{type:string;deviceId:string|null;note:string;createdAt:string}[];
};
export type PluginLicenseData = {licenses:PluginLicenseView[];total:number;matching:number;page:number;pageCount:number;plan:string;status:string};
export type PluginSearchParams = {[key:string]:string|string[]|undefined};
export type PluginIssueResult = {code:string;licenseId:string};
