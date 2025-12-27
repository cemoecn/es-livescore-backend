/**
 * GET /api/matches/date/[date]
 * Returns matches for a specific date from Supabase
 * Data is synced daily by the cron job and updated in real-time by WebSocket
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid date format. Use YYYY-MM-DD',
                },
                { status: 400 }
            );
        }

        // Create date range for the given day
        const startOfDay = new Date(`${date}T00:00:00Z`);
        const endOfDay = new Date(`${date}T23:59:59Z`);

        // Fetch matches from Supabase with team and competition data
        const { data: matches, error: dbError } = await supabase
            .from('matches')
            .select(`
                *,
                home_team:teams!matches_home_team_id_fkey(id, name, short_name, logo),
                away_team:teams!matches_away_team_id_fkey(id, name, short_name, logo),
                competition:competitions(id, name, short_name, logo, country_id, primary_color, secondary_color)
            `)
            .gte('start_time', startOfDay.toISOString())
            .lte('start_time', endOfDay.toISOString())
            .order('start_time', { ascending: true });

        if (dbError) {
            console.error('Supabase error:', dbError);
            return NextResponse.json({
                success: true,
                data: [],
                date,
                count: 0,
                source: 'supabase',
                error: dbError.message,
                timestamp: new Date().toISOString(),
            });
        }

        // Transform to expected format
        const formattedMatches = (matches || []).map(m => ({
            id: m.id,
            homeTeam: m.home_team ? {
                id: m.home_team.id,
                name: m.home_team.name,
                shortName: m.home_team.short_name || m.home_team.name,
                logo: m.home_team.logo || '',
                country: '',
            } : { id: '', name: 'TBD', shortName: 'TBD', logo: '', country: '' },
            awayTeam: m.away_team ? {
                id: m.away_team.id,
                name: m.away_team.name,
                shortName: m.away_team.short_name || m.away_team.name,
                logo: m.away_team.logo || '',
                country: '',
            } : { id: '', name: 'TBD', shortName: 'TBD', logo: '', country: '' },
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
                type: 'league',
            } : { id: '', name: 'Unknown', shortName: 'Unknown', logo: '', country: '', type: 'league' },
            venue: m.venue || '',
            referee: m.referee,
        }));

        return NextResponse.json({
            success: true,
            data: formattedMatches,
            date,
            count: formattedMatches.length,
            source: 'supabase',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching matches:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 30 seconds
export const revalidate = 30;
