/**
 * GET /api/matches/[id]/events
 * Returns match events (goals, cards, substitutions)
 * 
 * Uses endpoints from TheSportsAPI.pdf:
 * - /v1/football/match/live/history - for historical match incidents
 * - /v1/football/match/detail_live - for live match real-time data
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

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Try the historical match incidents endpoint first (from TheSportsAPI.pdf)
        // This endpoint returns: score, match stats, match incidents, technical statistics
        const historyUrl = `${API_URL}/v1/football/match/live/history?user=${USERNAME}&secret=${API_KEY}&id=${id}`;

        let events: ApiEvent[] = [];
        let source = 'live/history';

        const historyResponse = await fetch(historyUrl, {
            headers: { 'Accept': 'application/json' },
        });

        if (historyResponse.ok) {
            const historyData = await historyResponse.json();

            if (!historyData.err && historyData.data) {
                // Extract incidents from the response
                // The API returns data with incidents array
                const matchData = Array.isArray(historyData.data)
                    ? historyData.data[0]
                    : historyData.data;

                if (matchData?.incidents) {
                    events = matchData.incidents;
                } else if (matchData?.tlive) {
                    // tlive contains timeline/live events
                    events = matchData.tlive;
                }
            }
        }

        // If no events found, try the team_stats endpoint as fallback
        if (events.length === 0) {
            const statsUrl = `${API_URL}/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&id=${id}`;
            const statsResponse = await fetch(statsUrl, {
                headers: { 'Accept': 'application/json' },
            });

            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                if (!statsData.err && statsData.data) {
                    source = 'team_stats/detail';
                    // Extract any event data from stats response
                    const matchStats = Array.isArray(statsData.data)
                        ? statsData.data[0]
                        : statsData.data;
                    if (matchStats?.incidents) {
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
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match events:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [], // Return empty array so frontend doesn't break
            },
            { status: 500 }
        );
    }
}

// Revalidate every 10 seconds for live matches
export const revalidate = 10;

