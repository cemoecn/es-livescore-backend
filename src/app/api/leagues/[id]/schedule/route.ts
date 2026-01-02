/**
 * GET /api/leagues/[id]/schedule
 * Returns match schedule for a league, optionally filtered by matchday (round)
 * Uses TheSports /match/season/recent API with season_id
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
    'l965mkyh32r1ge4': '56ypq3nhx51md7o', // Championship 2024/25
    'vl7oqdehlyr510j': '56ypq3nhxw7md7o', // La Liga 2024/25
    '4zp5rzghp5q82w1': '4zp5rzghn83q82w', // Serie A 2024/25
    'yl5ergphnzr8k0o': '9dn1m1gh645moep', // Ligue 1 2024/25
    'vl7oqdeheyr510j': 'yl5ergphgo0r8k0', // Eredivisie 2024/25
    '9vjxm8ghx2r6odg': 'kjw2r09h811rz84', // Primeira Liga 2024/25
    'z8yomo4h7wq0j6l': 'z8yomo4hn70q0j6', // Champions League 2024/25
    '56ypq3nh0xmd7oj': 'v2y8m4zhl38ql07', // Europa League 2024/25
};

export async function GET(
    request: NextRequest,
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

        // Get optional round/matchday query parameter
        const { searchParams } = new URL(request.url);
        const round = searchParams.get('round');

        // Fetch matches from TheSports API using season/recent
        let apiUrl = `${API_URL}/v1/football/match/season/recent?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`;

        // Add round filter if specified
        if (round) {
            apiUrl += `&round=${round}`;
        }

        const response = await fetch(apiUrl);
        const data = await response.json();

        const matches = data?.results || [];

        if (matches.length === 0) {
            return NextResponse.json({
                success: true,
                data: { matches: [], round: round || 'all' },
            });
        }

        // Get unique team IDs for lookup
        const teamIds = new Set<string>();
        for (const match of matches) {
            if (match.home_team_id) teamIds.add(match.home_team_id);
            if (match.away_team_id) teamIds.add(match.away_team_id);
        }

        // Fetch team info from Supabase
        const { data: teamsData } = await supabase
            .from('teams')
            .select('id, name, logo')
            .in('id', Array.from(teamIds));

        // Build team lookup map
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsData) {
            for (const team of teamsData) {
                teamMap.set(team.id, { name: team.name, logo: team.logo || '' });
            }
        }

        // Transform matches with team info
        // API Status IDs: 1 = upcoming, 8 = finished
        const transformedMatches = matches.map((match: any) => {
            const homeTeam = teamMap.get(match.home_team_id) || { name: 'Home', logo: '' };
            const awayTeam = teamMap.get(match.away_team_id) || { name: 'Away', logo: '' };
            const matchTime = match.match_time ? new Date(match.match_time * 1000) : null;

            // Extract scores from home_scores[0] and away_scores[0] arrays
            const homeScore = match.home_scores?.[0] ?? null;
            const awayScore = match.away_scores?.[0] ?? null;

            return {
                id: match.id,
                homeTeam: {
                    id: match.home_team_id,
                    name: homeTeam.name,
                    logo: homeTeam.logo,
                    score: homeScore,
                },
                awayTeam: {
                    id: match.away_team_id,
                    name: awayTeam.name,
                    logo: awayTeam.logo,
                    score: awayScore,
                },
                startTime: matchTime?.toISOString() || null,
                date: matchTime?.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) || null,
                time: matchTime?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) || null,
                status: match.status_id || 0,
                round: match.round?.round_num ?? null,
            };
        });

        // Sort by start time
        transformedMatches.sort((a: any, b: any) => {
            if (!a.startTime) return 1;
            if (!b.startTime) return -1;
            return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });

        // Find current/latest round (highest round number)
        const allRounds = transformedMatches.map((m: any) => m.round).filter((r: any) => r != null);
        const currentRound = allRounds.length > 0 ? Math.max(...allRounds) : 1;

        return NextResponse.json({
            success: true,
            data: {
                matches: transformedMatches,
                round: round || 'all',
                currentRound,
                totalMatches: transformedMatches.length,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching schedule:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
