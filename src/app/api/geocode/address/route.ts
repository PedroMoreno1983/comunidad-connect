import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

type GeocodeSuggestion = {
    label: string;
    latitude: number;
    longitude: number;
    placeId: string;
    source: 'mapbox' | 'nominatim';
};

function cleanQuery(value: string | null) {
    return (value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function validCoordinate(latitude: number, longitude: number) {
    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= -90
        && latitude <= 90
        && longitude >= -180
        && longitude <= 180;
}

async function geocodeWithMapbox(query: string): Promise<GeocodeSuggestion[] | null> {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return null;

    const params = new URLSearchParams({
        access_token: token,
        country: 'cl',
        language: 'es',
        limit: '5',
        types: 'address,poi,place,locality,neighborhood',
    });

    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) return null;
    const data = await response.json() as {
        features?: Array<{
            id?: string;
            place_name?: string;
            center?: [number, number];
        }>;
    };

    return (data.features || [])
        .map((feature): GeocodeSuggestion | null => {
            const [longitude, latitude] = feature.center || [];
            if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
            if (!feature.place_name || !validCoordinate(latitude, longitude)) return null;
            return {
                label: feature.place_name,
                latitude,
                longitude,
                placeId: feature.id || feature.place_name,
                source: 'mapbox',
            };
        })
        .filter((item): item is GeocodeSuggestion => Boolean(item));
}

async function geocodeWithNominatim(query: string): Promise<GeocodeSuggestion[]> {
    const params = new URLSearchParams({
        q: query,
        countrycodes: 'cl',
        format: 'jsonv2',
        addressdetails: '1',
        limit: '5',
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': process.env.GEOCODING_USER_AGENT || 'ConviveConnect/1.0 (https://conviveconnect.com)',
        },
        next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) return [];
    const data = await response.json() as Array<{
        place_id?: number;
        display_name?: string;
        lat?: string;
        lon?: string;
    }>;

    return data
        .map((item): GeocodeSuggestion | null => {
            const latitude = Number(item.lat);
            const longitude = Number(item.lon);
            if (!item.display_name || !validCoordinate(latitude, longitude)) return null;
            return {
                label: item.display_name,
                latitude,
                longitude,
                placeId: item.place_id ? String(item.place_id) : item.display_name,
                source: 'nominatim',
            };
        })
        .filter((item): item is GeocodeSuggestion => Boolean(item));
}

export async function GET(request: NextRequest) {
    const limited = enforceRateLimit(request, 'geocode.address', { limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    const query = cleanQuery(request.nextUrl.searchParams.get('q'));
    if (query.length < 5) {
        return NextResponse.json({ suggestions: [] });
    }

    try {
        const mapbox = await geocodeWithMapbox(query);
        const suggestions = mapbox && mapbox.length > 0
            ? mapbox
            : await geocodeWithNominatim(query);

        return NextResponse.json({ suggestions });
    } catch (error) {
        console.warn('[geocode/address] failed:', error);
        return NextResponse.json({ suggestions: [] });
    }
}
