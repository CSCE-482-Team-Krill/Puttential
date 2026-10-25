import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache: pages are static and the API routes are fully dynamic.
export default defineCloudflareConfig({});
