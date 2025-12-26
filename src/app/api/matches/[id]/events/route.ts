/**
 * GET /api/matches/[id]/events
 * Returns match events (goals, cards, substitutions)
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Fetch match incidents/events from TheSports API
        const url = `${API_URL}/v1/football/match/incident/list?user=${USERNAME}&secret=${API_KEY}&id=${id}`;
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

        // Extract events from the response
        const events = data.results || data.data?.results || data;

        return NextResponse.json({
            success: true,
            data: events,
            matchId: id,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match events:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 10 seconds for live matches
export const revalidate = 10;
