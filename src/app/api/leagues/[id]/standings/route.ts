/**
 * GET /api/leagues/[id]/standings
 * Returns full standings for a league using TheSports API
 * 1. Fetches competition detail to get cur_season_id
 * 2. Fetches table for that season
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;

        // Step 1: Get competition details to find cur_season_id
        const compResponse = await fetch(
            `${API_URL}/v1/football/competition/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${leagueId}`
        );
        const compData = await compResponse.json();

        const competition = compData.results || compData.data;
        const curSeasonId = competition?.cur_season_id;
        const curRound = competition?.cur_round;

        if (!curSeasonId) {
            return NextResponse.json({
                success: false,
                error: 'Could not find current season for this competition',
                debug: { compData: JSON.stringify(compData).slice(0, 500) },
            }, { status: 404 });
        }

        // Step 2: Get table for current season
        const tableResponse = await fetch(
            `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${curSeasonId}`
        );
        const tableData = await tableResponse.json();

        // Get team names from Supabase
        const { data: teams } = await supabase.from('teams').select('id, name, logo');
        const teamMap = new Map(teams?.map(t => [t.id, { name: t.name, logo: t.logo }]) || []);

        // Process standings
        const tableResults = tableData.results;
        const rows = tableResults?.tables?.[0]?.rows || [];

        // Map all standings (full table)
        const standings = rows.map((row: any, idx: number) => {
            const teamInfo = teamMap.get(row.team_id);
            return {
                position: row.position || idx + 1,
                team_id: row.team_id,
                team: teamInfo?.name || `Team ${row.team_id?.slice(0, 8)}`,
                logo: teamInfo?.logo || '',
                played: row.total || 0,
                won: row.won || 0,
                drawn: row.draw || 0,
                lost: row.loss || 0,
                goalsFor: row.goals || 0,
                goalsAgainst: row.goals_against || 0,
                goalDiff: (row.goals || 0) - (row.goals_against || 0),
                points: row.points || 0,
                zone: getZone(row.position || idx + 1, rows.length),
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                competition_id: leagueId,
                season_id: curSeasonId,
                current_round: curRound,
                matchday: rows[0]?.total || curRound || 0,
                standings,
            },
        });
    } catch (error) {
        console.error('Error fetching standings:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Helper to determine zone based on position
function getZone(position: number, totalTeams: number): string | undefined {
    if (position <= 4) return 'cl';
    if (position === 5) return 'el';
    if (position === 6) return 'ecl';
    if (position >= totalTeams - 2) return 'relegation';
    return undefined;
}

export const dynamic = 'force-dynamic';
