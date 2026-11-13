"use client";

import { useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import type { BuildingAddressPickerProps, GeocodeSuggestionsResponse, GeocodeSuggestion } from "@/lib/types";

const inputClass = "w-full px-4 py-3 rounded-xl border bg-[var(--cc-paper)] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all";

/** Busca la dirección del edificio (mismo geocodificador que el onboarding) y deja elegir una. */
export function BuildingAddressPicker({ value, onChange }: BuildingAddressPickerProps) {
    const [query, setQuery] = useState(value?.label || "");
    const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const search = async () => {
        if (query.trim().length < 5) return;
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch(`/api/geocode/address?q=${encodeURIComponent(query.trim())}`);
            const result = await response.json() as GeocodeSuggestionsResponse;
            const found = response.ok ? result.suggestions : [];
            setSuggestions(found);
            if (!found.length) setMessage("No encontré esa dirección. Prueba con calle, número y comuna.");
        } catch {
            setMessage("No pude buscar la dirección. Intenta de nuevo.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    id="building-address"
                    type="text"
                    value={query}
                    onChange={event => { setQuery(event.target.value); setSuggestions([]); if (value) onChange(null); }}
                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
                    placeholder="Ej: Av. Providencia 1234, Providencia"
                    className={inputClass}
                    style={{ borderColor: "var(--cc-line-strong)" }}
                />
                <button type="button" onClick={() => void search()} disabled={busy || query.trim().length < 5}
                    aria-label="Buscar dirección"
                    className="grid shrink-0 place-items-center rounded-xl border px-3 disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
            </div>
            {suggestions.length > 0 && (
                <ul className="space-y-1 rounded-xl border p-1.5" style={{ borderColor: "var(--cc-line)" }}>
                    {suggestions.map(suggestion => (
                        <li key={suggestion.placeId}>
                            <button type="button" onClick={() => { onChange(suggestion); setQuery(suggestion.label); setSuggestions([]); }}
                                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-black/5">
                                <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: "var(--cc-copper)" }} />
                                <span>{suggestion.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {value && <p className="text-xs" style={{ color: "var(--cc-sage)" }}>Dirección elegida.</p>}
            {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
        </div>
    );
}
