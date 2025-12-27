/**
 * GET /api/matches/[id]/events
 * Returns match events (goals, cards, substitutions) from Supabase
 * Falls back to TheSports API if not in database
 */

import { supabase } from '@/lib/supabase';
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
    in_player_id?: string;
    in_player_name?: string;
    out_player_id?: string;
    out_player_name?: string;
    position?: number;
    home_score?: number;
    away_score?: number;
}

interface DetailLiveMatch {
    id: string;
    incidents?: ApiEvent[];
    tlive?: ApiEvent[];
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Try Supabase first
        const { data: dbEvents, error: dbError } = await supabase
            .from('match_events')
            .select('*')
            .eq('match_id', id)
            .order('time', { ascending: true });

        if (!dbError && dbEvents && dbEvents.length > 0) {
            // Transform to API format
            const events = dbEvents.map(e => ({
                type: e.type,
                time: e.time,
                position: e.position,
                player_id: e.player_id,
                player_name: e.player_name,
                player2_id: e.player2_id,
                player2_name: e.player2_name,
                in_player_id: e.in_player_id,
                in_player_name: e.in_player_name,
                out_player_id: e.out_player_id,
                out_player_name: e.out_player_name,
                home_score: e.home_score,
                away_score: e.away_score,
            }));

            return NextResponse.json({
                success: true,
                data: events,
                matchId: id,
                source: 'supabase',
                eventCount: events.length,
                timestamp: new Date().toISOString(),
            });
        }

        // 2. Fallback to TheSports API
        let events: ApiEvent[] = [];
        let source = 'none';

        // Try detail_live first
        const detailLiveUrl = `${API_URL}/v1/football/match/detail_live?user=${USERNAME}&secret=${API_KEY}`;
        const detailLiveResponse = await fetch(detailLiveUrl, {
            headers: { 'Accept': 'application/json' },
        });

        if (detailLiveResponse.ok) {
            const detailLiveData = await detailLiveResponse.json();

            if (!detailLiveData.err) {
                const matches: DetailLiveMatch[] = Array.isArray(detailLiveData.results)
                    ? detailLiveData.results
                    : (Array.isArray(detailLiveData.data)
                        ? detailLiveData.data
                        : (detailLiveData.data?.results || []));

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

        // Try live/history as fallback
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
