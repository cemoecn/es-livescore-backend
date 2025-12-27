/**
 * WebSocket Service for TheSports MQTT Real-time Updates
 * Connects to wss://mq.thesports.com for instant match updates
 */

import { supabase } from '@/lib/supabase';
import mqtt, { MqttClient } from 'mqtt';

const MQTT_HOST = process.env.THESPORTS_MQTT_HOST || 'mq.thesports.com';
const MQTT_PORT = process.env.THESPORTS_MQTT_PORT || '8084';
const USERNAME = process.env.THESPORTS_USERNAME || '';
const API_KEY = process.env.THESPORTS_API_KEY || '';

let client: MqttClient | null = null;
let isConnecting = false;

// Topics to subscribe to
const TOPICS = [
    'thesports/football/match/v1', // Live match updates
    'thesports/football/incident/v1', // Events (goals, cards, etc.)
    'thesports/football/stats/v1', // Match statistics
];

interface MqttMatchUpdate {
    id: string;
    status_id?: number;
    home_score?: number;
    away_score?: number;
    minute?: number;
    home_team_id?: string;
    away_team_id?: string;
    competition_id?: string;
}

interface MqttIncidentUpdate {
    match_id: string;
    type: number;
    time?: number;
    position?: number;
    player_id?: string;
    player_name?: string;
    player2_id?: string;
    player2_name?: string;
    in_player_id?: string;
    in_player_name?: string;
    out_player_id?: string;
    out_player_name?: string;
    home_score?: number;
    away_score?: number;
}

// Status mapping
const STATUS_MAP: Record<number, string> = {
    0: 'scheduled',
    1: 'live',
    2: 'live',
    3: 'live',
    4: 'halftime',
    5: 'live',
    6: 'live',
    7: 'live',
    8: 'finished',
    9: 'finished',
    10: 'postponed',
    11: 'cancelled',
    12: 'interrupted',
    13: 'suspended',
};

/**
 * Handle incoming match update
 */
async function handleMatchUpdate(data: MqttMatchUpdate) {
    try {
        const status = STATUS_MAP[data.status_id || 0] || 'unknown';

        console.log(`[WS] Match ${data.id}: ${status}, score=${data.home_score || 0}-${data.away_score || 0}`);

        // First try to update existing match (most common case for live updates)
        const { data: existingMatch } = await supabase
            .from('matches')
            .select('id')
            .eq('id', data.id)
            .single();

        if (existingMatch) {
            // Update existing match
            const { error } = await supabase
                .from('matches')
                .update({
                    status: status,
                    minute: data.minute || null,
                    home_score: data.home_score || 0,
                    away_score: data.away_score || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', data.id);

            if (error) {
                console.error('[WS] Match update error:', error.message);
            }
        } else {
            // Insert new match with required start_time
            const { error } = await supabase
                .from('matches')
                .insert({
                    id: data.id,
                    status: status,
                    minute: data.minute || null,
                    home_score: data.home_score || 0,
                    away_score: data.away_score || 0,
                    home_team_id: data.home_team_id || null,
                    away_team_id: data.away_team_id || null,
                    competition_id: data.competition_id || null,
                    start_time: new Date().toISOString(), // Required field
                    updated_at: new Date().toISOString(),
                });

            if (error) {
                console.error('[WS] Match insert error:', error.message);
            }
        }
    } catch (error) {
        console.error('[WS] Error handling match update:', error);
    }
}

/**
 * Handle incoming incident (goal, card, etc.)
 */
async function handleIncidentUpdate(data: MqttIncidentUpdate) {
    try {
        console.log(`[WS] Incident: match=${data.match_id}, type=${data.type}, time=${data.time}`);

        const { error } = await supabase
            .from('match_events')
            .insert({
                match_id: data.match_id,
                type: data.type,
                time: data.time || null,
                position: data.position || null,
                player_id: data.player_id || null,
                player_name: data.player_name || null,
                player2_id: data.player2_id || null,
                player2_name: data.player2_name || null,
                in_player_id: data.in_player_id || null,
                in_player_name: data.in_player_name || null,
                out_player_id: data.out_player_id || null,
                out_player_name: data.out_player_name || null,
                home_score: data.home_score || null,
                away_score: data.away_score || null,
            });

        if (error) {
            console.error('[WS] Incident insert error:', error.message);
        }

        // Also update match score if scores are provided
        if (data.home_score !== undefined || data.away_score !== undefined) {
            await supabase
                .from('matches')
                .update({
                    home_score: data.home_score || 0,
                    away_score: data.away_score || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', data.match_id);
        }
    } catch (error) {
        console.error('[WS] Error handling incident:', error);
    }
}

/**
 * Connect to MQTT broker
 */
export function connectMqtt(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (client?.connected) {
            console.log('[WS] Already connected');
            resolve();
            return;
        }

        if (isConnecting) {
            console.log('[WS] Connection already in progress');
            resolve();
            return;
        }

        if (!USERNAME || !API_KEY) {
            console.warn('[WS] MQTT credentials not configured. Skipping WebSocket connection.');
            resolve();
            return;
        }

        isConnecting = true;
        const url = `wss://${MQTT_HOST}:${MQTT_PORT}/mqtt`;

        console.log(`[WS] Connecting to ${url}...`);

        client = mqtt.connect(url, {
            username: USERNAME,
            password: API_KEY,
            clientId: `es-livescore-${Date.now()}`,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 30000,
            protocolVersion: 4,
            // Skip SSL certificate verification (TheSports uses a cert that can't be verified)
            rejectUnauthorized: false,
        });

        client.on('connect', () => {
            console.log('[WS] Connected to TheSports MQTT!');
            isConnecting = false;

            // Subscribe to topics
            TOPICS.forEach(topic => {
                client?.subscribe(topic, { qos: 1 }, (err) => {
                    if (err) {
                        console.error(`[WS] Failed to subscribe to ${topic}:`, err);
                    } else {
                        console.log(`[WS] Subscribed to ${topic}`);
                    }
                });
            });

            resolve();
        });

        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());

                if (topic.includes('match')) {
                    // Handle as array or single object
                    const updates = Array.isArray(data) ? data : [data];
                    updates.forEach(handleMatchUpdate);
                } else if (topic.includes('incident')) {
                    const updates = Array.isArray(data) ? data : [data];
                    updates.forEach(handleIncidentUpdate);
                }
            } catch (error) {
                console.error('[WS] Error parsing message:', error);
            }
        });

        client.on('error', (error) => {
            console.error('[WS] Connection error:', error);
            isConnecting = false;
        });

        client.on('close', () => {
            console.log('[WS] Connection closed');
            isConnecting = false;
        });

        client.on('reconnect', () => {
            console.log('[WS] Reconnecting...');
        });

        // Timeout if connection takes too long
        setTimeout(() => {
            if (isConnecting) {
                isConnecting = false;
                console.warn('[WS] Connection timeout - continuing with HTTP polling');
                resolve();
            }
        }, 10000);
    });
}

/**
 * Disconnect from MQTT broker
 */
export function disconnectMqtt(): Promise<void> {
    return new Promise((resolve) => {
        if (client) {
            client.end(true, {}, () => {
                console.log('[WS] Disconnected');
                client = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
    return client?.connected || false;
}

export const WebSocketService = {
    connect: connectMqtt,
    disconnect: disconnectMqtt,
    isConnected,
};

export default WebSocketService;
