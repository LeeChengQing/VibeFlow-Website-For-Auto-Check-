import {defineConfig} from '@playwright/test';
import original from './playwright.admin.config';
const servers=Array.isArray(original.webServer)?original.webServer:[];
export default defineConfig({...original,testDir:'./tests',testMatch:'plugin-admin-e2e.spec.ts',outputDir:'./test-results/plugin-admin',webServer:servers.map(server=>({...server,url:server.command.includes('next dev')?'http://127.0.0.1:3103/admin':server.url,command:server.command.includes('next dev')?server.command+' --webpack':server.command,env:{...server.env,PLUGIN_AUTH_SUPABASE_URL:'http://127.0.0.1:54330',PLUGIN_AUTH_SUPABASE_SERVICE_ROLE_KEY:'test-service-role-only-credentials'}}))});
