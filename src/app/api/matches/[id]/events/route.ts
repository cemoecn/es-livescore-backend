/**
 * GET /api/matches/[id]/events
 * Returns match events (goals, cards, substitutions)
 * 
 * Uses endpoints from TheSportsAPI.pdf:
 * - /v1/football/match/detail_live - Real-time data with incidents for ALL live matches
 * - /v1/football/match/live/history - Historical match data with incidents
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

interface ApiEvent {
    type?: number;
    time?: number;
    player_id?: string;
    player_name?: string;
    player2_id?: string;
    player2_name?: string;
    position?: number;
    home_score?: number;
    away_score?: number;
}

interface DetailLiveMatch {
    id: string;
    incidents?: ApiEvent[];
    tlive?: ApiEvent[];
    score?: unknown;
    stats?: unknown;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        let events: ApiEvent[] = [];
        let source = 'none';

        // 1. Try detail_live first (real-time data for all live matches)
        // This returns ALL live matches with their incidents - we need to find our match
        const detailLiveUrl = `${API_URL}/v1/football/match/detail_live?user=${USERNAME}&secret=${API_KEY}`;
        const detailLiveResponse = await fetch(detailLiveUrl, {
            headers: { 'Accept': 'application/json' },
        });

        if (detailLiveResponse.ok) {
            const detailLiveData = await detailLiveResponse.json();

            if (!detailLiveData.err) {
                // The API can return results at the top level or inside data
                const matches: DetailLiveMatch[] = Array.isArray(detailLiveData.results)
                    ? detailLiveData.results
                    : (Array.isArray(detailLiveData.data)
                        ? detailLiveData.data
                        : (detailLiveData.data?.results || []));

                // Find our specific match
                const match = matches.find(m => String(m.id) === String(id));

                if (match) {
                    source = 'detail_live';
                    if (match.incidents && Array.isArray(match.incidents)) {
                        events = match.incidents;
                    } else if (match.tlive && Array.isArray(match.tlive)) {
                        events = match.tlive;
                    }
                }
            }
        }

        // 2. If no events from detail_live, try live/history (for historical data)
        if (events.length === 0) {
            const historyUrl = `${API_URL}/v1/football/match/live/history?user=${USERNAME}&secret=${API_KEY}&id=${id}`;
            const historyResponse = await fetch(historyUrl, {
                headers: { 'Accept': 'application/json' },
            });

            if (historyResponse.ok) {
                const historyData = await historyResponse.json();

                if (!historyData.err && historyData.data) {
                    source = 'live/history';
                    const matchData = Array.isArray(historyData.data)
                        ? historyData.data.find((m: DetailLiveMatch) => m.id === id) || historyData.data[0]
                        : historyData.data;

                    if (matchData?.incidents && Array.isArray(matchData.incidents)) {
                        events = matchData.incidents;
                    } else if (matchData?.tlive && Array.isArray(matchData.tlive)) {
                        events = matchData.tlive;
                    }
                }
            }
        }

        // 3. Fallback: try team_stats/detail which might have event data
        if (events.length === 0) {
            const statsUrl = `${API_URL}/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&id=${id}`;
            const statsResponse = await fetch(statsUrl, {
                headers: { 'Accept': 'application/json' },
            });

            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                if (!statsData.err && statsData.data) {
                    const matchStats = Array.isArray(statsData.data)
                        ? statsData.data[0]
                        : statsData.data;
                    if (matchStats?.incidents && Array.isArray(matchStats.incidents)) {
                        source = 'team_stats/detail';
                        events = matchStats.incidents;
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: events,
            matchId: id,
            source,
            eventCount: events.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match events:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
            },
            { status: 500 }
        );
    }
}

// Revalidate every 5 seconds for live matches
export const revalidate = 5;
