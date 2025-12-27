/**
 * GET /api/matches/live
 * Returns all currently live matches from Supabase
 * SIMPLIFIED: All team/competition names are directly in matches table!
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // SIMPLE query - no JOINs needed!
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
            });
        }

        // Transform - data is already denormalized!
        const formattedMatches = (matches || []).map(m => ({
            id: m.id,
            homeTeam: {
                id: m.home_team_id || '',
                name: m.home_team_name || 'TBD',
                shortName: m.home_team_name || 'TBD',
                logo: m.home_team_logo || '',
            },
            awayTeam: {
                id: m.away_team_id || '',
                name: m.away_team_name || 'TBD',
                shortName: m.away_team_name || 'TBD',
                logo: m.away_team_logo || '',
            },
            score: {
                home: m.home_score || 0,
                away: m.away_score || 0
            },
            status: m.status,
            minute: m.minute,
            startTime: m.start_time,
            competition: {
                id: m.competition_id || '',
                name: m.competition_name || 'Unknown',
                shortName: m.competition_name || 'Unknown',
                logo: m.competition_logo || '',
                country: m.competition_country || '',
            },
            venue: m.venue || '',
            referee: m.referee,
        }));

        return NextResponse.json({
            success: true,
            data: formattedMatches,
            count: formattedMatches.length,
        });
    } catch (error) {
        console.error('Error fetching live matches:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const revalidate = 5;
