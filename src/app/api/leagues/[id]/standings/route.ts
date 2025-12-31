/**
 * GET /api/leagues/[id]/standings
 * Returns full standings for a league using TheSports season/recent/table/detail API
 * Team names and logos are fetched from Supabase teams cache (synced from TheSports)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Current 2024/25 season IDs mapped by competition_id
const CURRENT_SEASON_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'e4wyrn4hg8gq86p', // Bundesliga 2024/25
    'jednm9whz0ryox8': 'l965mkyhjpxr1ge', // Premier League 2024/25
    'vl7oqdehlyr510j': 'l965mkyhjpxr1ge', // La Liga (temp)
    '4zp5rzghp5q82w1': 'l965mkyhjpxr1ge', // Serie A (temp)
    'yl5ergphnzr8k0o': 'e4wyrn4hg8gq86p', // Ligue 1 (temp)
};

// Zone configuration per league (positions for CL, EL, ECL, relegation)
const LEAGUE_ZONES: Record<string, { cl: number[]; el: number[]; ecl: number[]; relegation: number[] }> = {
    'gy0or5jhg6qwzv3': { cl: [1, 2, 3, 4], el: [5, 6], ecl: [7], relegation: [16, 17, 18] }, // Bundesliga
    'jednm9whz0ryox8': { cl: [1, 2, 3, 4], el: [5], ecl: [6], relegation: [18, 19, 20] }, // Premier League
    'vl7oqdehlyr510j': { cl: [1, 2, 3, 4], el: [5, 6], ecl: [], relegation: [18, 19, 20] }, // La Liga
    '4zp5rzghp5q82w1': { cl: [1, 2, 3, 4], el: [5], ecl: [6], relegation: [18, 19, 20] }, // Serie A
    'yl5ergphnzr8k0o': { cl: [1, 2, 3], el: [4], ecl: [5], relegation: [16, 17, 18] }, // Ligue 1
};

function getZone(position: number, leagueId: string): 'cl' | 'el' | 'ecl' | 'relegation' | null {
    const zones = LEAGUE_ZONES[leagueId];
    if (!zones) return null;

    if (zones.cl.includes(position)) return 'cl';
    if (zones.el.includes(position)) return 'el';
    if (zones.ecl.includes(position)) return 'ecl';
    if (zones.relegation.includes(position)) return 'relegation';
    return null;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;
        const seasonId = CURRENT_SEASON_IDS[leagueId];

        if (!seasonId) {
            return NextResponse.json(
                { success: false, error: `No season ID configured for league ${leagueId}` },
                { status: 400 }
            );
        }

        // Fetch standings from TheSports API
        const standingsResponse = await fetch(
            `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`
        );
        const standingsData = await standingsResponse.json();

        const tables = standingsData?.results?.tables || [];
        const rows = tables[0]?.rows || [];

        if (rows.length === 0) {
            return NextResponse.json({
                success: true,
                data: { standings: [], seasonId, teamsCount: 0 },
            });
        }

        // Get all team IDs from standings
        const teamIds = rows.map((row: any) => row.team_id as string);

        // Fetch team info from Supabase in one query
        const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, logo')
            .in('id', teamIds);

        if (teamsError) {
            console.error('Supabase teams fetch error:', teamsError);
        }

        // Build team lookup map
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsData) {
            for (const team of teamsData) {
                teamMap.set(team.id, { name: team.name, logo: team.logo || '' });
            }
        }

        // Build standings with team info
        const standings = rows.map((row: any, idx: number) => {
            const teamInfo = teamMap.get(row.team_id) || { name: `Team ${idx + 1}`, logo: '' };
            const position = row.position || idx + 1;

            return {
                position,
                team: teamInfo.name,
                logo: teamInfo.logo,
                played: row.total || 0,
                won: row.won || 0,
                drawn: row.draw || 0,
                lost: row.loss || 0,
                goals: `${row.goals || 0}:${row.goals_against || 0}`,
                goalDiff: row.goal_diff || 0,
                points: row.points || 0,
                zone: getZone(position, leagueId),
            };
        });

        // Debug: check which teams are missing
        const missingTeams = standings.filter(s => s.team.startsWith('Team '));

        return NextResponse.json({
            success: true,
            data: {
                standings,
                seasonId,
                teamsCount: standings.length,
            },
            debug: {
                teamsInDb: teamsData?.length || 0,
                missingCount: missingTeams.length,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching standings:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
