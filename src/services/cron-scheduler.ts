/**
 * Internal Cron Scheduler
 * Runs periodic sync tasks within the main backend process
 */

import cron from 'node-cron';

const BACKEND_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'http://localhost:3000';

// Helper to call sync endpoints
async function callSync(endpoint: string, name: string) {
    try {
        const url = `${BACKEND_URL}/api/cron/${endpoint}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        console.log(`[CRON] ${name}: synced=${data.synced || 0}, errors=${data.errors || 0}`);
        return data;
    } catch (error) {
        console.error(`[CRON] ${name} failed:`, error);
        return null;
    }
}

// Initialize cron jobs
export function startCronJobs() {
    console.log('[CRON] Starting scheduled sync jobs...');

    // Sync live matches every 30 seconds
    // Note: Railway's minimum cron interval is 1 minute, so we use node-cron internally
    cron.schedule('*/30 * * * * *', () => {
        callSync('sync-live', 'Live Sync');
    });

    // Sync daily matches every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        const today = new Date().toISOString().split('T')[0];
        callSync(`sync-daily?date=${today}`, 'Daily Sync');
    });

    // Sync standings every 10 minutes
    cron.schedule('*/10 * * * *', () => {
        callSync('sync-standings', 'Standings Sync');
    });

    console.log('[CRON] Scheduled jobs:');
    console.log('  - Live Sync: every 30 seconds');
    console.log('  - Daily Sync: every 5 minutes');
    console.log('  - Standings Sync: every 10 minutes');
}

export default { startCronJobs };
