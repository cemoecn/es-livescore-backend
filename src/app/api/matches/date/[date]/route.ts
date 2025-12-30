/**
 * GET /api/matches/date/[date]
 * Returns matches for a specific date from Supabase
 * SIMPLIFIED: All team/competition names are directly in matches table!
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// TOP LEAGUES - Only return matches from these competitions
const TOP_LEAGUE_IDS = [
    'jednm9whz0ryox8', // Premier League
    'l965mkyh32r1ge4', // Championship
    'gy0or5jhg6qwzv3', // Bundesliga
    'vl7oqdehlyr510j', // La Liga
    '4zp5rzghp5q82w1', // Serie A
    'yl5ergphnzr8k0o', // Ligue 1
    'vl7oqdeheyr510j', // Eredivisie
    '9vjxm8ghx2r6odg', // Primeira Liga
    'z8yomo4h7wq0j6l', // Champions League
    '56ypq3nh0xmd7oj', // Europa League
    'p4jwq2gh754m0ve', // Conference League
];

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
                { status: 400 }
            );
        }

        // Create date range for the given day
        const startOfDay = new Date(`${date}T00:00:00Z`);
        const endOfDay = new Date(`${date}T23:59:59Z`);

        // SIMPLE query - filter by TOP_LEAGUE_IDS
        const { data: matches, error: dbError } = await supabase
            .from('matches')
            .select('*')
            .gte('start_time', startOfDay.toISOString())
            .lte('start_time', endOfDay.toISOString())
            .in('competition_id', TOP_LEAGUE_IDS)
            .order('start_time', { ascending: true });

        if (dbError) {
            console.error('Supabase error:', dbError);
            return NextResponse.json({
                success: true,
                data: [],
                date,
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
                type: 'league',
            },
            venue: m.venue || '',
            referee: m.referee,
        }));

        return NextResponse.json({
            success: true,
            data: formattedMatches,
            date,
            count: formattedMatches.length,
        });
    } catch (error) {
        console.error('Error fetching matches:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const revalidate = 30;
