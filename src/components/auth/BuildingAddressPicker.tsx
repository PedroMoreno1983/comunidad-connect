"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { BuildingAddressPickerProps, GeocodeSuggestionsResponse, GeocodeSuggestion } from "@/lib/types";

const inputClass = "w-full rounded-xl border bg-[var(--cc-paper)] py-3 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all";

/** Desde cuántas letras se busca, y cuánto se espera a que la persona deje de escribir. */
const MIN_CHARS = 5;
const DEBOUNCE_MS = 350;

/**
 * Dirección del edificio con autocompletado: sugiere mientras se escribe
 * (mismo geocodificador que el onboarding) y la persona elige una.
 */
export function BuildingAddressPicker({ value, onChange }: BuildingAddressPickerProps) {
    const [query, setQuery] = useState(value?.label || "");
    const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const listId = useId();
    const lastChosen = useRef(value?.label || "");

    useEffect(() => {
        const text = query.trim();
        // Recién elegida (o muy corta): no hay nada que buscar.
        if (text.length < MIN_CHARS || text === lastChosen.current) {
            setSuggestions([]);
            setBusy(false);
            setMessage("");
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setBusy(true);
            setMessage("");
            try {
                const response = await fetch(`/api/geocode/address?q=${encodeURIComponent(text)}`, { signal: controller.signal });
                const result = await response.json() as GeocodeSuggestionsResponse;
                const found = response.ok ? result.suggestions : [];
                setSuggestions(found);
                setHighlighted(found.length ? 0 : -1);
                setOpen(true);
                if (!found.length) setMessage("No encontré esa dirección. Prueba con calle, número y comuna.");
            } catch (error) {
                if ((error as Error).name !== "AbortError") setMessage("No pude buscar la dirección. Intenta de nuevo.");
            } finally {
                if (!controller.signal.aborted) setBusy(false);
            }
        }, DEBOUNCE_MS);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [query]);

    const choose = (suggestion: GeocodeSuggestion) => {
        lastChosen.current = suggestion.label;
        onChange(suggestion);
        setQuery(suggestion.label);
        setSuggestions([]);
        setOpen(false);
        setHighlighted(-1);
    };

    const showList = open && suggestions.length > 0;

    return (
        <div className="relative space-y-2">
            <div className="relative">
                <MapPin size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--cc-copper)" }} />
                <input
                    id="building-address"
                    type="text"
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={showList && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
                    autoComplete="off"
                    value={query}
                    onChange={event => {
                        setQuery(event.target.value);
                        setOpen(true);
                        if (value) { lastChosen.current = ""; onChange(null); }
                    }}
                    onFocus={() => { if (suggestions.length) setOpen(true); }}
                    onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                    onKeyDown={event => {
                        if (!showList) return;
                        if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted(index => (index + 1) % suggestions.length); }
                        else if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted(index => (index <= 0 ? suggestions.length - 1 : index - 1)); }
                        else if (event.key === "Enter" && highlighted >= 0) { event.preventDefault(); choose(suggestions[highlighted]); }
                        else if (event.key === "Escape") { setOpen(false); }
                    }}
                    placeholder="Empieza a escribir: Av. Providencia 1234"
                    className={inputClass}
                    style={{ borderColor: "var(--cc-line-strong)" }}
                />
                {busy && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
            </div>
            {showList && (
                <ul id={listId} role="listbox" className="absolute left-0 right-0 top-[3.25rem] z-20 space-y-0.5 rounded-xl border p-1.5 shadow-lg"
                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    {suggestions.map((suggestion, index) => (
                        <li key={suggestion.placeId} id={`${listId}-${index}`} role="option" aria-selected={index === highlighted}>
                            <button type="button" tabIndex={-1}
                                onMouseDown={event => event.preventDefault()}
                                onMouseEnter={() => setHighlighted(index)}
                                onClick={() => choose(suggestion)}
                                className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs"
                                style={index === highlighted ? { background: "var(--cc-copper-tint)" } : undefined}>
                                <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: "var(--cc-copper)" }} />
                                <span className="cc-text-primary">{suggestion.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {value && <p className="text-xs" style={{ color: "var(--cc-sage)" }}>Dirección elegida.</p>}
            {message && !busy && <p role="status" className="text-xs text-slate-600">{message}</p>}
        </div>
    );
}
