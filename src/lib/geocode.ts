export type GeocodeSource = 'mapbox' | 'nominatim';

export type GeocodeSuggestion = {
    label: string;
    latitude: number;
    longitude: number;
    placeId: string;
    source: GeocodeSource | string;
};
