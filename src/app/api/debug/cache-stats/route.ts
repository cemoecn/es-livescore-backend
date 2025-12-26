/**
 * GET /api/debug/cache-stats
 * Returns cache statistics for debugging
 */

import { getCacheStats } from '@/services/cache';
import { NextResponse } from 'next/server';

export async function GET() {
    const stats = getCacheStats();

    return NextResponse.json({
        success: true,
        cache: {
            teams: stats.teams,
            competitions: stats.competitions,
            countries: stats.countries,
            teamsAgeMinutes: Math.round(stats.teamsAge / 60000),
            competitionsAgeMinutes: Math.round(stats.competitionsAge / 60000),
            countriesAgeMinutes: Math.round(stats.countriesAge / 60000),
        },
        timestamp: new Date().toISOString(),
    });
}
