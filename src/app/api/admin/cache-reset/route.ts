/**
 * POST /api/admin/cache-reset
 * Hard reset of all backend caches
 * Forces fresh data fetch from Supabase on next request
 */

import { NextResponse } from 'next/server';

// Import cache module to reset it
import * as cache from '@/services/cache';

export async function POST() {
    try {
        console.log('[CacheReset] Performing hard cache reset...');

        // Reset all in-memory caches
        cache.resetAllCaches();

        console.log('[CacheReset] Cache reset complete');

        return NextResponse.json({
            success: true,
            message: 'All caches have been reset. Fresh data will be fetched on next request.',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[CacheReset] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export async function GET() {
    return POST();
}

export const dynamic = 'force-dynamic';
