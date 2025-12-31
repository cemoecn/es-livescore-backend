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

        // Exhaustive corrections for Bundesliga 24/25 entries
        const TEAM_NAME_CORRECTIONS: Record<string, string> = {
            'yl5ergphjy2r8k0': 'FC Bayern Munich',
            '4zp5rzghe4nq82w': 'Borussia Dortmund',
            '4zp5rzghewnq82w': 'Bayer 04 Leverkusen',
            'z318q66hdleqo9j': 'Eintracht Frankfurt',
            'kdj2ryoh3wyq1zp': 'RB Leipzig',
            'gx7lm7phd7em2wd': 'VfB Stuttgart',
            'p3glrw7henvqdyj': 'TSG 1899 Hoffenheim',
            '9vjxm8gh613r6od': '1. FC Union Berlin',
            'l965mkyh924r1ge': 'SC Freiburg',
            '9k82rekhdxorepz': 'SV Werder Bremen',
            'yl5ergphj74r8k0': '1. FC Köln',
            'l965mkyh9o4r1ge': 'Borussia Mönchengladbach',
            'gy0or5jhdoyqwzv': 'Hamburger SV',
            '56ypq3nhdnkmd7o': 'VfL Wolfsburg',
            'vl7oqdehzvnr510': 'FC Augsburg',
            'gy0or5jhkvwqwzv': '1. FC Heidenheim',
            'n54qllh261zqvy9': 'Holstein Kiel',
            'jednm9whl2kryox': '1. FSV Mainz 05',
        };

        // Apply corrections
        for (const [id, correctName] of Object.entries(TEAM_NAME_CORRECTIONS)) {
            const existing = teamMap.get(id);
            if (existing) {
                teamMap.set(id, { ...existing, name: correctName });
            } else {
                teamMap.set(id, { name: correctName, logo: '' });
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
        const missingTeams = standings.filter((s: any) => s.team.startsWith('Team '));

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
                allTeamIds: rows.map((row: any) => ({
                    position: row.position,
                    team_id: row.team_id,
                })),
                appliedCorrections: Object.keys(TEAM_NAME_CORRECTIONS).length
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
