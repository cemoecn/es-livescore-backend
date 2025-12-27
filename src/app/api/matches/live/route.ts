/**
 * GET /api/matches/live
 * Returns all currently live matches from Supabase
 * Falls back to TheSports API if Supabase is empty (bootstrap mode)
 */

import { supabase } from '@/lib/supabase';
import { EnrichmentService, type RawMatch } from '@/services/enrichment';
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET() {
    try {
        // Try Supabase first
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

        if (!dbError && matches && matches.length > 0) {
            // Transform Supabase data to match expected format
            const formattedMatches = matches.map(m => ({
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
        }

        // Fallback to TheSports API (bootstrap mode or empty DB)
        console.log('Supabase empty or error, falling back to TheSports API');
        const url = `${API_URL}/v1/football/match/recent/list?user=${USERNAME}&secret=${API_KEY}`;
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

        const rawMatches: RawMatch[] = data.data?.results || data.results || [];
        const enrichedMatches = await EnrichmentService.enrichMatches(rawMatches);
        const liveMatches = enrichedMatches.filter(
            m => m.status === 'live' || m.status === 'halftime'
        );

        return NextResponse.json({
            success: true,
            data: liveMatches,
            count: liveMatches.length,
            source: 'thesports_api',
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

