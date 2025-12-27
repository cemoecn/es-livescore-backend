/**
 * Next.js Instrumentation
 * This file runs on server startup - perfect for initializing cron jobs
 */

export async function register() {
    // Only run on server, not during build
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startCronJobs } = await import('./services/cron-scheduler');
        startCronJobs();
    }
}
