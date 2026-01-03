/**
 * GET /api/matches/[id]/lineup
 * Returns match lineup (starting players, substitutes, formations)
 * Uses TheSports /v1/football/match/lineup/detail API
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Map position codes to display format
const POSITION_MAP: Record<string, string> = {
    'G': 'TW',   // Goalkeeper -> Torwart
    'D': 'ABW',  // Defender -> Abwehr
    'M': 'MIT',  // Midfielder -> Mittelfeld
    'F': 'STR',  // Forward -> Stürmer
};

interface ApiPlayer {
    id: string;
    name: string;
    logo?: string;
    shirt_number?: number;
    position?: string;
    first?: number;
    captain?: number;
    x?: number;
    y?: number;
    rating?: string;
    incidents?: any[];
}

interface TransformedPlayer {
    id: string;
    name: string;
    logo: string | null;
    number: number;
    position: string;
    positionLabel: string;
    isStarter: boolean;
    isCaptain: boolean;
    x: number | null;
    y: number | null;
    rating: string | null;
    incidents: any[];
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Fetch match lineup from TheSports API using lineup/detail
        const url = `${API_URL}/v1/football/match/lineup/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${id}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.err) {
            throw new Error(data.err);
        }

        const results = data.results || {};

        // Transform player data
        const transformPlayer = (player: ApiPlayer): TransformedPlayer => ({
            id: player.id,
            name: player.name || 'Unbekannt',
            logo: player.logo || null,
            number: player.shirt_number || 0,
            position: player.position || '',
            positionLabel: POSITION_MAP[player.position || ''] || player.position || '',
            isStarter: player.first === 1,
            isCaptain: player.captain === 1,
            x: player.x ?? null,
            y: player.y ?? null,
            rating: player.rating || null,
            incidents: player.incidents || [],
        });

        // Get home and away lineups
        const homeLineup = (results.lineup?.home || []).map(transformPlayer);
        const awayLineup = (results.lineup?.away || []).map(transformPlayer);

        // Separate starters and substitutes
        const homeStarters = homeLineup.filter((p: TransformedPlayer) => p.isStarter);
        const homeSubs = homeLineup.filter((p: TransformedPlayer) => !p.isStarter);
        const awayStarters = awayLineup.filter((p: TransformedPlayer) => p.isStarter);
        const awaySubs = awayLineup.filter((p: TransformedPlayer) => !p.isStarter);

        // Extract coach data - API may provide coach object with id, name, logo
        const homeCoach = results.coach?.home || null;
        const awayCoach = results.coach?.away || null;

        // Get coach IDs
        const homeCoachId = results.coach_id?.home || homeCoach?.id || null;
        const awayCoachId = results.coach_id?.away || awayCoach?.id || null;

        // Fetch coach details if we have IDs
        let homeCoachName = homeCoach?.name || null;
        let homeCoachLogo = homeCoach?.logo || null;
        let awayCoachName = awayCoach?.name || null;
        let awayCoachLogo = awayCoach?.logo || null;

        // Fetch coach from /coach/list API if we only have ID
        if (homeCoachId && !homeCoachName) {
            try {
                const coachRes = await fetch(
                    `${API_URL}/v1/football/coach/list?user=${USERNAME}&secret=${API_KEY}&uuid=${homeCoachId}`
                );
                const coachData = await coachRes.json();
                const coach = coachData.results?.[0] || coachData.results;
                if (coach) {
                    homeCoachName = coach.name || coach.name_en || null;
                    homeCoachLogo = coach.logo || null;
                }
            } catch (e) {
                console.error('Failed to fetch home coach:', e);
            }
        }

        if (awayCoachId && !awayCoachName) {
            try {
                const coachRes = await fetch(
                    `${API_URL}/v1/football/coach/list?user=${USERNAME}&secret=${API_KEY}&uuid=${awayCoachId}`
                );
                const coachData = await coachRes.json();
                const coach = coachData.results?.[0] || coachData.results;
                if (coach) {
                    awayCoachName = coach.name || coach.name_en || null;
                    awayCoachLogo = coach.logo || null;
                }
            } catch (e) {
                console.error('Failed to fetch away coach:', e);
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                confirmed: results.confirmed === 1,
                home: {
                    formation: results.home_formation || null,
                    coachId: homeCoachId,
                    coachName: homeCoachName,
                    coachLogo: homeCoachLogo,
                    starters: homeStarters,
                    substitutes: homeSubs,
                },
                away: {
                    formation: results.away_formation || null,
                    coachId: awayCoachId,
                    coachName: awayCoachName,
                    coachLogo: awayCoachLogo,
                    starters: awayStarters,
                    substitutes: awaySubs,
                },
                injury: results.injury || null,
            },
            matchId: id,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match lineup:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 60 seconds (lineups don't change often)
export const revalidate = 60;
