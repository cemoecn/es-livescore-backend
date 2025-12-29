/**
 * POST /api/admin/refresh-events
 * Manually refresh events for a match from TheSports API
 * Used when events were stored before schema updates (missing var_reason/var_result)
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
    var_reason?: number;
    var_result?: number;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { matchId } = body;

        if (!matchId) {
            return NextResponse.json(
                { success: false, error: 'matchId is required' },
                { status: 400 }
            );
        }

        console.log(`[Admin] Refreshing events for match ${matchId}`);

        // Fetch from TheSports API - try live/history endpoint for finished matches
        const historyUrl = `${API_URL}/v1/football/match/live/history?user=${USERNAME}&secret=${API_KEY}&id=${matchId}`;
        const response = await fetch(historyUrl, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            return NextResponse.json(
                { success: false, error: `API request failed: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();

        if (data.err) {
            return NextResponse.json(
                { success: false, error: `API error: ${data.err}` },
                { status: 500 }
            );
        }

        // Extract incidents
        let incidents: ApiEvent[] = [];
        const matchData = Array.isArray(data.data)
            ? data.data.find((m: any) => m.id === matchId) || data.data[0]
            : data.data;

        if (matchData?.incidents && Array.isArray(matchData.incidents)) {
            incidents = matchData.incidents;
        } else if (matchData?.tlive && Array.isArray(matchData.tlive)) {
            incidents = matchData.tlive;
        }

        if (incidents.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No incidents found in API',
                eventsCount: 0,
            });
        }

        // Delete existing events
        await supabase
            .from('match_events')
            .delete()
            .eq('match_id', matchId);

        // Insert fresh events with var_reason and var_result
        const eventsToInsert = incidents.map(incident => ({
            match_id: matchId,
            type: incident.type ?? null,
            time: incident.time ?? null,
            position: incident.position ?? null,
            player_id: incident.player_id ?? null,
            player_name: incident.player_name ?? null,
            player2_id: incident.player2_id ?? null,
            player2_name: incident.player2_name ?? null,
            in_player_id: incident.in_player_id ?? null,
            in_player_name: incident.in_player_name ?? null,
            out_player_id: incident.out_player_id ?? null,
            out_player_name: incident.out_player_name ?? null,
            home_score: incident.home_score ?? null,
            away_score: incident.away_score ?? null,
            var_reason: incident.var_reason ?? null,
            var_result: incident.var_result ?? null,
        }));

        const { error: insertError } = await supabase
            .from('match_events')
            .insert(eventsToInsert);

        if (insertError) {
            console.error('[Admin] Insert error:', insertError);
            return NextResponse.json(
                { success: false, error: insertError.message },
                { status: 500 }
            );
        }

        console.log(`[Admin] Refreshed ${eventsToInsert.length} events for match ${matchId}`);

        // Log VAR events specifically
        const varEvents = eventsToInsert.filter(e => e.type === 28);
        if (varEvents.length > 0) {
            console.log(`[Admin] VAR events found:`, varEvents.map(e => ({
                time: e.time,
                var_reason: e.var_reason,
                var_result: e.var_result,
            })));
        }

        return NextResponse.json({
            success: true,
            eventsCount: eventsToInsert.length,
            varEventsCount: varEvents.length,
            varEvents: varEvents.map(e => ({
                time: e.time,
                player: e.player_name,
                var_reason: e.var_reason,
                var_result: e.var_result,
            })),
        });
    } catch (error) {
        console.error('[Admin] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
