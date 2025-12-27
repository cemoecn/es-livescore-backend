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

        // Fetch matches from Supabase
        // Note: Using separate lookup for teams/competitions if FK relationships don't exist
        const { data: matches, error: dbError } = await supabase
            .from('matches')
            .select('*')
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

        // Get all unique team and competition IDs
        const teamIds = new Set<string>();
        const compIds = new Set<string>();
        (matches || []).forEach(m => {
            if (m.home_team_id) teamIds.add(m.home_team_id);
            if (m.away_team_id) teamIds.add(m.away_team_id);
            if (m.competition_id) compIds.add(m.competition_id);
        });

        // Fetch teams and competitions in bulk
        const [teamsResult, compsResult] = await Promise.all([
            teamIds.size > 0
                ? supabase.from('teams').select('*').in('id', Array.from(teamIds))
                : { data: [] },
            compIds.size > 0
                ? supabase.from('competitions').select('*').in('id', Array.from(compIds))
                : { data: [] },
        ]);

        // Create lookup maps
        const teamsMap = new Map((teamsResult.data || []).map(t => [t.id, t]));
        const compsMap = new Map((compsResult.data || []).map(c => [c.id, c]));

        // Transform to expected format using lookup maps
        const formattedMatches = (matches || []).map(m => {
            const homeTeam = teamsMap.get(m.home_team_id);
            const awayTeam = teamsMap.get(m.away_team_id);
            const competition = compsMap.get(m.competition_id);

            return {
                id: m.id,
                homeTeam: homeTeam ? {
                    id: homeTeam.id,
                    name: homeTeam.name,
                    shortName: homeTeam.short_name || homeTeam.name,
                    logo: homeTeam.logo || '',
                    country: '',
                } : { id: m.home_team_id || '', name: 'TBD', shortName: 'TBD', logo: '', country: '' },
                awayTeam: awayTeam ? {
                    id: awayTeam.id,
                    name: awayTeam.name,
                    shortName: awayTeam.short_name || awayTeam.name,
                    logo: awayTeam.logo || '',
                    country: '',
                } : { id: m.away_team_id || '', name: 'TBD', shortName: 'TBD', logo: '', country: '' },
                score: { home: m.home_score || 0, away: m.away_score || 0 },
                status: m.status,
                minute: m.minute,
                startTime: m.start_time,
                competition: competition ? {
                    id: competition.id,
                    name: competition.name,
                    shortName: competition.short_name || competition.name,
                    logo: competition.logo || '',
                    country: competition.country_id || '',
                    primaryColor: competition.primary_color,
                    secondaryColor: competition.secondary_color,
                    type: 'league',
                } : { id: m.competition_id || '', name: 'Unknown', shortName: 'Unknown', logo: '', country: '', type: 'league' },
                venue: m.venue || '',
                referee: m.referee,
            };
        });

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
