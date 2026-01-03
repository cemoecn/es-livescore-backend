/**
 * GET /api/matches/[id]/info
 * Returns additional match information: venue, referee, environment (weather)
 * Uses TheSports /v1/football/match/detail API
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Weather code to German label mapping
const WEATHER_LABELS: Record<number, string> = {
    1: 'Teilweise bewölkt',
    2: 'Bewölkt',
    3: 'Teilweise bewölkt/Regen',
    4: 'Schnee',
    5: 'Sonnig',
    6: 'Bedeckt/Gewitter',
    7: 'Bedeckt',
    8: 'Nebelig',
    9: 'Bedeckt mit Regen',
    10: 'Bewölkt mit Regen',
    11: 'Bewölkt mit Regen/Gewitter',
    12: 'Wolken/Regen/Gewitter lokal',
    13: 'Nebel',
};

// Weather code to icon mapping
const WEATHER_ICONS: Record<number, string> = {
    1: '⛅',
    2: '☁️',
    3: '🌦️',
    4: '❄️',
    5: '☀️',
    6: '⛈️',
    7: '☁️',
    8: '🌫️',
    9: '🌧️',
    10: '🌧️',
    11: '⛈️',
    12: '⛈️',
    13: '🌫️',
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: matchId } = await params;

        // Fetch match detail from TheSports API using match/recent/list
        const response = await fetch(
            `${API_URL}/v1/football/match/recent/list?user=${USERNAME}&secret=${API_KEY}&uuid=${matchId}`
        );
        const apiData = await response.json();

        if (apiData.err) {
            return NextResponse.json({
                success: false,
                error: apiData.err,
            }, { status: 400 });
        }

        const matchData = apiData.results?.[0] || apiData.results || {};

        // Extract venue, referee, environment
        const venueId = matchData.venue_id || null;
        const refereeId = matchData.referee_id || null;
        const environment = matchData.environment || null;

        // Fetch venue name from Supabase if we have venue_id
        let venueName: string | null = null;
        let venueCity: string | null = null;
        let venueCapacity: number | null = null;

        if (venueId) {
            const { data: venueData } = await supabase
                .from('venues')
                .select('name, city, capacity')
                .eq('id', venueId)
                .single();

            if (venueData) {
                venueName = venueData.name;
                venueCity = venueData.city;
                venueCapacity = venueData.capacity;
            }
        }

        // Fetch referee name from Supabase if we have referee_id
        let refereeName: string | null = null;
        let refereeCountry: string | null = null;

        if (refereeId) {
            const { data: refereeData } = await supabase
                .from('referees')
                .select('name, country')
                .eq('id', refereeId)
                .single();

            if (refereeData) {
                refereeName = refereeData.name;
                refereeCountry = refereeData.country;
            }
        }

        // Parse environment data
        let weatherInfo = null;
        if (environment) {
            const weatherCode = environment.weather;

            // Helper to format values - handle both raw numbers and already-formatted strings
            const formatTemp = (val: unknown): string | null => {
                if (val == null) return null;
                const str = String(val);
                // If already has unit, return as-is
                if (str.includes('°')) return str;
                return `${str}°C`;
            };

            const formatHumidity = (val: unknown): string | null => {
                if (val == null) return null;
                const str = String(val);
                if (str.includes('%')) return str;
                return `${str}%`;
            };

            const formatWind = (val: unknown): string | null => {
                if (val == null) return null;
                const str = String(val);
                if (str.includes('m/s') || str.includes('km/h')) return str;
                return `${str} m/s`;
            };

            weatherInfo = {
                weather: WEATHER_LABELS[weatherCode] || null,
                weatherIcon: WEATHER_ICONS[weatherCode] || '🌡️',
                weatherCode: weatherCode,
                temperature: formatTemp(environment.temperature),
                humidity: formatHumidity(environment.humidity),
                wind: formatWind(environment.wind),
                pressure: environment.pressure != null ? `${environment.pressure} hPa` : null,
            };
        }

        return NextResponse.json({
            success: true,
            data: {
                venue: venueName ? {
                    id: venueId,
                    name: venueName,
                    city: venueCity,
                    capacity: venueCapacity,
                } : null,
                referee: refereeName ? {
                    id: refereeId,
                    name: refereeName,
                    country: refereeCountry,
                } : null,
                environment: weatherInfo,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match info:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
