/**
 * GET /api/matches/live
 * Returns all currently live matches from Supabase
 * Data comes exclusively from WebSocket service
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Get live matches from Supabase (populated by WebSocket service)
        const { data: matches, error: dbError } = await supabase
            .from('matches')
            .select(`
                *,
                home_team:teams!matches_home_team_id_fkey(id, name, short_name, logo),
                away_team:teams!matches_away_team_id_fkey(id, name, short_name, logo),
                competition:competitions(id, name, short_name, logo, country_id, primary_color, secondary_color)
            `)
            .in('status', ['live', 'halftime'])
            .order('start_time', { ascending: true });

        if (dbError) {
            console.error('Supabase error:', dbError);
            return NextResponse.json({
                success: true,
                data: [],
                count: 0,
                source: 'supabase',
                message: 'Database error, no fallback',
                timestamp: new Date().toISOString(),
            });
        }

        // Transform Supabase data to match expected format
        const formattedMatches = (matches || []).map(m => ({
            id: m.id,
            homeTeam: m.home_team ? {
                id: m.home_team.id,
                name: m.home_team.name,
                shortName: m.home_team.short_name || m.home_team.name,
                logo: m.home_team.logo || '',
            } : { id: '', name: 'TBD', shortName: 'TBD', logo: '' },
            awayTeam: m.away_team ? {
                id: m.away_team.id,
                name: m.away_team.name,
                shortName: m.away_team.short_name || m.away_team.name,
                logo: m.away_team.logo || '',
            } : { id: '', name: 'TBD', shortName: 'TBD', logo: '' },
            score: { home: m.home_score || 0, away: m.away_score || 0 },
            status: m.status,
            minute: m.minute,
            startTime: m.start_time,
            competition: m.competition ? {
                id: m.competition.id,
                name: m.competition.name,
                shortName: m.competition.short_name || m.competition.name,
                logo: m.competition.logo || '',
                country: m.competition.country_id || '',
                primaryColor: m.competition.primary_color,
                secondaryColor: m.competition.secondary_color,
            } : { id: '', name: 'Unknown', shortName: 'Unknown', logo: '' },
            venue: m.venue || '',
            referee: m.referee,
        }));

        return NextResponse.json({
            success: true,
            data: formattedMatches,
            count: formattedMatches.length,
            source: 'supabase',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching live matches:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 5 seconds for live data
export const revalidate = 5;
