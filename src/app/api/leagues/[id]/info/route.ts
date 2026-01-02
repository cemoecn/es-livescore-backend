/**
 * GET /api/leagues/[id]/info
 * Returns combined info for a league's Info Tab:
 * - Season progress
 * - Top 3 standings (from TheSports season/recent/table/detail API)
 * - Top match of the matchday
 * - Championship history (static)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Current 2025/26 season IDs mapped by competition_id
// These are verified to work with /v1/football/season/recent/table/detail
const CURRENT_SEASON_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'e4wyrn4hg8gq86p', // Bundesliga 2025/26
    'jednm9whz0ryox8': 'l965mkyhjpxr1ge', // Premier League 2025/26
    'l965mkyh32r1ge4': '56ypq3nhx51md7o', // Championship 2025/26
    'vl7oqdehlyr510j': '56ypq3nhxw7md7o', // La Liga 2025/26
    '4zp5rzghp5q82w1': '4zp5rzghn83q82w', // Serie A 2025/26
    'yl5ergphnzr8k0o': '9dn1m1gh645moep', // Ligue 1 2025/26
    'vl7oqdeheyr510j': 'yl5ergphgo0r8k0', // Eredivisie 2025/26
    '9vjxm8ghx2r6odg': 'kjw2r09h811rz84', // Primeira Liga 2025/26
    'z8yomo4h7wq0j6l': 'z8yomo4hn70q0j6', // Champions League 2025/26
    '56ypq3nh0xmd7oj': 'v2y8m4zhl38ql07', // Europa League 2025/26
};

// Current stage IDs for fetching matchday fixtures
const CURRENT_STAGE_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'y39mp1he8ddmojx', // Bundesliga
    'jednm9whz0ryox8': '6ypq3nhpo67md7o', // Premier League
    'l965mkyh32r1ge4': 'jw2r09hgv82rz84', // Championship
    'vl7oqdehlyr510j': 'dn1m1ghgdd5moep', // La Liga
    '4zp5rzghp5q82w1': '4wyrn4h5pzlq86p', // Serie A
    'yl5ergphnzr8k0o': '965mkyh098kr1ge', // Ligue 1
    'vl7oqdeheyr510j': '1l4rjnhdp4km7vx', // Eredivisie
    '9vjxm8ghx2r6odg': '965mkyh09vxr1ge', // Primeira Liga
    'z8yomo4h7wq0j6l': 'dj2ryoh9064q1zp', // Champions League
    '56ypq3nh0xmd7oj': 'vjxm8gh76d0r6od', // Europa League
};

// Season info per league (2025/26)
const SEASON_INFO: Record<string, { totalMatchdays: number; season: string; teamCount: number }> = {
    'gy0or5jhg6qwzv3': { totalMatchdays: 34, season: '2025/26', teamCount: 18 }, // Bundesliga
    'jednm9whz0ryox8': { totalMatchdays: 38, season: '2025/26', teamCount: 20 }, // Premier League
    'l965mkyh32r1ge4': { totalMatchdays: 46, season: '2025/26', teamCount: 24 }, // Championship
    'vl7oqdehlyr510j': { totalMatchdays: 38, season: '2025/26', teamCount: 20 }, // La Liga
    '4zp5rzghp5q82w1': { totalMatchdays: 38, season: '2025/26', teamCount: 20 }, // Serie A
    'yl5ergphnzr8k0o': { totalMatchdays: 34, season: '2025/26', teamCount: 18 }, // Ligue 1
    'vl7oqdeheyr510j': { totalMatchdays: 34, season: '2025/26', teamCount: 18 }, // Eredivisie
    '9vjxm8ghx2r6odg': { totalMatchdays: 34, season: '2025/26', teamCount: 18 }, // Primeira Liga
    'z8yomo4h7wq0j6l': { totalMatchdays: 8, season: '2025/26', teamCount: 36 }, // Champions League
    '56ypq3nh0xmd7oj': { totalMatchdays: 8, season: '2025/26', teamCount: 36 }, // Europa League
};



export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;
        const seasonId = CURRENT_SEASON_IDS[leagueId];
        const seasonInfo = SEASON_INFO[leagueId] || { totalMatchdays: 34, season: '2025/26', teamCount: 18 };

        // 1. Fetch standings from TheSports API first
        let tableResult = null;
        if (seasonId) {
            try {
                const response = await fetch(`${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`);
                tableResult = await response.json();
            } catch (err) {
                console.error('Table fetch error:', err);
            }
        }

        // Parse standings rows
        const tables = tableResult?.results?.tables || [];
        const rows = tables[0]?.rows || [];

        // 2. Get team IDs from top 3 standings
        const top3TeamIds = rows.slice(0, 3).map((row: any) => row.team_id as string);

        // 3. Fetch data in parallel - teams by specific IDs, upcoming matches from API
        const [teamsResult, upcomingMatchResult, competitionAdditional] = await Promise.all([
            // Get only the teams we need from Supabase
            top3TeamIds.length > 0
                ? supabase
                    .from('teams')
                    .select('id, name, logo')
                    .in('id', top3TeamIds)
                : Promise.resolve({ data: [], error: null }),

            // Get recent matches from TheSports API using season_id (auto-updates with current season)
            seasonId
                ? fetch(`${API_URL}/v1/football/match/season/recent?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`)
                    .then(r => r.json())
                    .catch(err => {
                        console.error('Match season/recent fetch error:', err);
                        return null;
                    })
                : Promise.resolve(null),

            // Get competition additional data (title_holder, most_titles) from TheSports API
            fetch(`${API_URL}/v1/football/competition/additional/list?user=${USERNAME}&secret=${API_KEY}&uuid=${leagueId}`)
                .then(r => r.json())
                .catch(err => {
                    console.error('Competition additional fetch error:', err);
                    return null;
                }),
        ]);

        // Build team lookup map
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsResult.data) {
            for (const team of teamsResult.data) {
                teamMap.set(team.id, { name: team.name, logo: team.logo || '' });
            }
        }

        // Process standings
        let top3Standings: Array<{
            position: number;
            team: string;
            logo: string;
            played: number;
            won: number;
            drawn: number;
            lost: number;
            goals: string;
            points: number;
            zone?: string;
        }> = [];

        let currentMatchday = 1;

        if (rows.length > 0) {
            // Get matchday from first team's total games played
            currentMatchday = rows[0]?.total || 1;

            // Get top 3 standings with team name lookup
            top3Standings = rows.slice(0, 3).map((row: any, idx: number) => {
                const teamInfo = teamMap.get(row.team_id) || { name: `Team ${idx + 1}`, logo: '' };
                return {
                    position: row.position || idx + 1,
                    team: teamInfo.name,
                    logo: teamInfo.logo,
                    played: row.total || 0,
                    won: row.won || 0,
                    drawn: row.draw || 0,
                    lost: row.loss || 0,
                    goals: `${row.goals || 0}:${row.goals_against || 0}`,
                    points: row.points || 0,
                    zone: idx < 4 ? 'cl' : undefined,
                };
            });
        }

        // Find top match from TheSports API response
        // Logic: One team in Top 3, opponent in middle-to-upper table half
        // IMPORTANT: Only from current (next) matchday
        let topMatch = null;
        const upcomingMatches = upcomingMatchResult?.results || [];

        if (upcomingMatches.length > 0 && rows.length > 0) {
            // Build position map from standings (team_id -> position)
            const positionMap = new Map<string, number>();
            rows.forEach((row: any) => {
                positionMap.set(row.team_id, row.position);
            });

            const teamCount = seasonInfo?.teamCount || 18;
            const upperHalfLimit = Math.ceil(teamCount / 2); // Top 50% of table

            // Filter upcoming matches only (status_id 1 = upcoming)
            const upcomingOnly = upcomingMatches.filter((m: any) => m.status_id === 1);

            // Find finished matches (status_id 8 = finished)
            const finishedMatches = upcomingMatches.filter((m: any) => m.status_id === 8);

            // Find the highest round that has finished matches
            const finishedRounds = finishedMatches
                .map((m: any) => m.round?.round_num)
                .filter((r: any) => r != null);
            const highestFinishedRound = finishedRounds.length > 0
                ? Math.max(...finishedRounds)
                : 0;

            // Find upcoming rounds that are after the highest finished round
            const upcomingRounds = upcomingOnly
                .map((m: any) => m.round?.round_num)
                .filter((r: any) => r != null && r > highestFinishedRound);

            // Current round = lowest upcoming round that's after finished rounds
            // If no such round exists, fall back to lowest upcoming round
            let currentRound: number | null = null;
            if (upcomingRounds.length > 0) {
                currentRound = Math.min(...upcomingRounds);
            } else {
                const allUpcomingRounds = upcomingOnly
                    .map((m: any) => m.round?.round_num)
                    .filter((r: any) => r != null);
                if (allUpcomingRounds.length > 0) {
                    currentRound = Math.min(...allUpcomingRounds);
                }
            }

            // Filter to only matches from the current round
            const currentRoundMatches = currentRound
                ? upcomingOnly.filter((m: any) => m.round?.round_num === currentRound)
                : upcomingOnly;

            // Find matches where one team is Top 3 and opponent is in upper half
            let bestMatch: any = null;
            let bestScore = Infinity;

            for (const match of currentRoundMatches) {
                const homePos = positionMap.get(match.home_team_id) || 999;
                const awayPos = positionMap.get(match.away_team_id) || 999;

                // Check if one team is in Top 3 and opponent in upper half
                const homeIsTop3 = homePos <= 3;
                const awayIsTop3 = awayPos <= 3;
                const homeInUpperHalf = homePos <= upperHalfLimit;
                const awayInUpperHalf = awayPos <= upperHalfLimit;

                // Valid top match: (homeTop3 && awayUpperHalf) OR (awayTop3 && homeUpperHalf)
                if ((homeIsTop3 && awayInUpperHalf) || (awayIsTop3 && homeInUpperHalf)) {
                    // Score = sum of positions (lower is better = bigger match)
                    const score = homePos + awayPos;
                    if (score < bestScore) {
                        bestScore = score;
                        bestMatch = match;
                    }
                }
            }

            // Fallback: if no top match found, try to find any match with Top 3 team (in current round)
            if (!bestMatch) {
                for (const match of currentRoundMatches) {
                    const homePos = positionMap.get(match.home_team_id) || 999;
                    const awayPos = positionMap.get(match.away_team_id) || 999;

                    if (homePos <= 3 || awayPos <= 3) {
                        const score = homePos + awayPos;
                        if (score < bestScore) {
                            bestScore = score;
                            bestMatch = match;
                        }
                    }
                }
            }

            // Final fallback: just take first match from current round
            if (!bestMatch && currentRoundMatches.length > 0) {
                bestMatch = currentRoundMatches[0];
            }

            if (bestMatch) {
                const matchDate = new Date(bestMatch.match_time * 1000);

                // Get team info
                let homeTeam = teamMap.get(bestMatch.home_team_id) || { name: 'Home', logo: '' };
                let awayTeam = teamMap.get(bestMatch.away_team_id) || { name: 'Away', logo: '' };

                // Fetch team info if not in map
                if (homeTeam.name === 'Home' || awayTeam.name === 'Away') {
                    const matchTeamIds = [bestMatch.home_team_id, bestMatch.away_team_id].filter(id => id);
                    if (matchTeamIds.length > 0) {
                        const { data: matchTeamsData } = await supabase
                            .from('teams')
                            .select('id, name, logo')
                            .in('id', matchTeamIds);

                        if (matchTeamsData) {
                            for (const t of matchTeamsData) {
                                if (t.id === bestMatch.home_team_id) {
                                    homeTeam = { name: t.name, logo: t.logo || '' };
                                }
                                if (t.id === bestMatch.away_team_id) {
                                    awayTeam = { name: t.name, logo: t.logo || '' };
                                }
                            }
                        }
                    }
                }

                topMatch = {
                    id: bestMatch.id,
                    homeTeam: {
                        name: homeTeam.name,
                        logo: homeTeam.logo,
                    },
                    awayTeam: {
                        name: awayTeam.name,
                        logo: awayTeam.logo,
                    },
                    date: matchDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                    time: matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                };
            }
        }

        // Get championship data from API or fallback to static data
        let championships = null;
        const additionalData = competitionAdditional?.results?.[0];
        if (additionalData) {
            // API format: title_holder = [team_id, title_count]
            // API format: most_titles = [[team_ids], count]
            const titleHolderRaw = additionalData.title_holder;
            const mostTitlesRaw = additionalData.most_titles;

            // Extract team_id and count from array format
            const titleHolderTeamId = Array.isArray(titleHolderRaw) ? titleHolderRaw[0] : null;
            const titleHolderCount = Array.isArray(titleHolderRaw) ? titleHolderRaw[1] : 0;

            const mostTitlesTeamId = Array.isArray(mostTitlesRaw) && Array.isArray(mostTitlesRaw[0])
                ? mostTitlesRaw[0][0]
                : null;
            const mostTitlesCount = Array.isArray(mostTitlesRaw) ? mostTitlesRaw[1] : 0;

            if (titleHolderTeamId || mostTitlesTeamId) {
                // Need to look up team names from Supabase for these team IDs
                const championTeamIds = [titleHolderTeamId, mostTitlesTeamId].filter(id => id);
                let championTeamMap = new Map<string, { name: string; logo: string }>();

                if (championTeamIds.length > 0) {
                    const { data: championTeams } = await supabase
                        .from('teams')
                        .select('id, name, logo')
                        .in('id', championTeamIds);

                    if (championTeams) {
                        for (const t of championTeams) {
                            championTeamMap.set(t.id, { name: t.name, logo: t.logo || '' });
                        }
                    }
                }

                const lastChampionTeam = titleHolderTeamId ? championTeamMap.get(titleHolderTeamId) : null;
                const mostTitlesTeam = mostTitlesTeamId ? championTeamMap.get(mostTitlesTeamId) : null;

                championships = {
                    lastChampion: lastChampionTeam ? {
                        name: lastChampionTeam.name,
                        logo: lastChampionTeam.logo,
                        season: '2024/25', // Current season's champion
                    } : null,
                    mostTitles: mostTitlesTeam ? {
                        name: mostTitlesTeam.name,
                        logo: mostTitlesTeam.logo,
                        count: mostTitlesCount || 0,
                    } : null,
                };
            }
        }
        // Extract colors from competition additional data
        const primaryColor = additionalData?.primary_color || null;
        const secondaryColor = additionalData?.secondary_color || null;

        return NextResponse.json({
            success: true,
            data: {
                seasonProgress: {
                    season: seasonInfo.season,
                    currentMatchday,
                    totalMatchdays: seasonInfo.totalMatchdays,
                    teamsCount: seasonInfo.teamCount,
                    progressPercent: Math.round((currentMatchday / seasonInfo.totalMatchdays) * 100),
                },
                standings: top3Standings,
                topMatch,
                championships,
                primaryColor,
                secondaryColor,
            },
            debug: {
                seasonId,
                rowsFromApi: rows.length,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching league info:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
