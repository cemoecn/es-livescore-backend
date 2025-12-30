/**
 * GET /api/debug/find-seasons
 * Finds current season IDs by analyzing recent matches in Supabase
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const TOP_LEAGUES = [
    { id: 'gy0or5jhg6qwzv3', name: 'Bundesliga' },
    { id: 'jednm9whz0ryox8', name: 'Premier League' },
    { id: 'vl7oqdehlyr510j', name: 'La Liga' },
    { id: '4zp5rzghp5q82w1', name: 'Serie A' },
    { id: 'yl5ergphnzr8k0o', name: 'Ligue 1' },
];

export async function GET() {
    try {
        const results: any[] = [];

        for (const league of TOP_LEAGUES) {
            // Get most common season_id from recent matches for this league
            const { data: matches, error } = await supabase
                .from('matches')
                .select('season_id')
                .eq('competition_id', league.id)
                .not('season_id', 'is', null)
                .order('start_time', { ascending: false })
                .limit(50);

            if (error) {
                results.push({ ...league, error: error.message });
                continue;
            }

            // Count season_ids
            const seasonCounts = new Map<string, number>();
            for (const m of matches || []) {
                if (m.season_id) {
                    seasonCounts.set(m.season_id, (seasonCounts.get(m.season_id) || 0) + 1);
                }
            }

            // Find most common
            let mostCommon = { id: null as string | null, count: 0 };
            for (const [id, count] of seasonCounts.entries()) {
                if (count > mostCommon.count) {
                    mostCommon = { id, count };
                }
            }

            results.push({
                ...league,
                matchesAnalyzed: matches?.length || 0,
                currentSeasonId: mostCommon.id,
                seasonCounts: Object.fromEntries(seasonCounts),
            });
        }

        // Build mapping
        const seasonMap: Record<string, string> = {};
        for (const r of results) {
            if (r.currentSeasonId) {
                seasonMap[r.id] = r.currentSeasonId;
            }
        }

        return NextResponse.json({
            success: true,
            results,
            seasonMap,
            codeToUse: `const CURRENT_SEASON_IDS: Record<string, string> = ${JSON.stringify(seasonMap, null, 4)};`,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
