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
            .select('*')
            .in('status', ['live', 'halftime'])
            .order('start_time', { ascending: true });

        if (dbError) {
            console.error('Supabase error:', dbError);
            return NextResponse.json({
                success: true,
                data: [],
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
                } : { id: m.home_team_id || '', name: 'TBD', shortName: 'TBD', logo: '' },
                awayTeam: awayTeam ? {
                    id: awayTeam.id,
                    name: awayTeam.name,
                    shortName: awayTeam.short_name || awayTeam.name,
                    logo: awayTeam.logo || '',
                } : { id: m.away_team_id || '', name: 'TBD', shortName: 'TBD', logo: '' },
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
                } : { id: m.competition_id || '', name: 'Unknown', shortName: 'Unknown', logo: '' },
                venue: m.venue || '',
                referee: m.referee,
            };
        });

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
