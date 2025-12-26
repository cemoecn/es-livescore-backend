/**
 * GET /api/debug/reload-cache
 * Forces a cache reload
 */

import { getCacheStats, initializeCache } from '@/services/cache';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        console.log('[Debug] Forcing cache reload...');

        // Force reload all caches
        await initializeCache();

        const stats = getCacheStats();

        return NextResponse.json({
            success: true,
            message: 'Cache reloaded',
            cache: {
                teams: stats.teams,
                competitions: stats.competitions,
                countries: stats.countries,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

// Don't cache this endpoint
export const dynamic = 'force-dynamic';
