/**
 * GET /api/cron/fix-team-names
 * One-time fix to update all matches with TBD team names
 * Uses the cache service to look up correct team names
 */

import { supabase } from '@/lib/supabase';
import { ensureCachesLoaded, getCacheStats, getCompetitionById, getTeamById } from '@/services/cache';
import { NextResponse } from 'next/server';

// Fallback logos for competitions (in case API doesn't provide one)
const COMPETITION_LOGOS: Record<string, string> = {
    'z8yomo4h7wq0j6l': 'https://img.thesports.com/football/competition/ac05535bde17129cb598311242b3afba.png', // Champions League
    '56ypq3nh0xmd7oj': 'https://img.thesports.com/football/competition/1792ba5a12171fedc6d543bdf173f37c.png', // Europa League
    'p4jwq2gh754m0ve': 'https://img.thesports.com/football/competition/88637a74a2cbd634b8b9504a60d711cd.png', // Conference League
};

export async function GET() {
    try {
        console.log('[Fix] Starting team name fix...');

        // 1. Load caches
        await ensureCachesLoaded();
        const stats = getCacheStats();
        console.log(`[Fix] Cache loaded: ${stats.teams} teams, ${stats.competitions} competitions`);

        // 2. Fetch all matches that have TBD or empty team names
        const { data: matches, error: fetchError } = await supabase
            .from('matches')
            .select('id, home_team_id, away_team_id, competition_id, home_team_name, away_team_name')
            .or('home_team_name.eq.TBD,home_team_name.is.null,away_team_name.eq.TBD,away_team_name.is.null');

        if (fetchError) {
            console.error('[Fix] Fetch error:', fetchError);
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        console.log(`[Fix] Found ${matches?.length || 0} matches to fix`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;

        // 3. Update each match
        for (const match of matches || []) {
            // Skip if no team IDs to look up
            if (!match.home_team_id && !match.away_team_id) {
                skipped++;
                continue;
            }

            const homeTeam = getTeamById(match.home_team_id || '');
            const awayTeam = getTeamById(match.away_team_id || '');
            const comp = getCompetitionById(match.competition_id || '');

            // Only update if we found at least one team
            if (!homeTeam && !awayTeam) {
                skipped++;
                continue;
            }

            const { error: updateError } = await supabase
                .from('matches')
                .update({
                    home_team_name: homeTeam?.name || match.home_team_name || 'TBD',
                    home_team_logo: homeTeam?.logo || '',
                    away_team_name: awayTeam?.name || match.away_team_name || 'TBD',
                    away_team_logo: awayTeam?.logo || '',
                    competition_name: comp?.short_name || comp?.name || 'Unknown',
                    competition_logo: comp?.logo || COMPETITION_LOGOS[match.competition_id || ''] || '',
                    competition_country: comp?.country_id || '',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', match.id);

            if (updateError) {
                errors++;
            } else {
                updated++;
            }
        }

        console.log(`[Fix] Complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);

        return NextResponse.json({
            success: true,
            totalMatches: matches?.length || 0,
            updated,
            skipped,
            errors,
            cacheStats: stats,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Fix] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for large updates
