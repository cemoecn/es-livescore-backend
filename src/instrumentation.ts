/**
 * Next.js Instrumentation
 * This file runs on server startup - perfect for initializing cron jobs and WebSocket
 */

export async function register() {
    // Only run on server, not during build
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Start cron jobs for periodic sync
        const { startCronJobs } = await import('./services/cron-scheduler');
        startCronJobs();

        // Connect to MQTT WebSocket for real-time updates
        const { connectMqtt } = await import('./services/websocket-service');
        connectMqtt().catch(err => {
            console.error('[Instrumentation] MQTT connection failed:', err);
        });
    }
}

