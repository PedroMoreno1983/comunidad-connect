"use client";

import { Search, X } from "lucide-react";

interface ProductFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    selectedCategory: string | null;
    setSelectedCategory: (cat: string | null) => void;
    categories: { id: string; label: string }[];
    getCategoryConfig: (category: string) => { icon: React.ElementType; gradient: string };
}

export function ProductFilters({ searchTerm, setSearchTerm, selectedCategory, setSelectedCategory, categories }: ProductFiltersProps) {
    return (
        <div>
            <div className="relative border-b pb-4" style={{ borderColor: "var(--cc-line-strong)" }}>
                <Search className="absolute left-0 top-0.5 h-5 w-5 cc-text-tertiary" strokeWidth={1.5} />
                <input
                    type="text"
                    placeholder="Busca en tu edificio…"
                    className="w-full bg-transparent pl-8 pr-10 text-base outline-none placeholder:cc-text-tertiary cc-text-primary sm:text-lg"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                />
                {searchTerm && (
                    <button type="button" onClick={() => setSearchTerm("")} className="absolute right-0 top-0 p-1 cc-text-tertiary" aria-label="Limpiar búsqueda">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>
            <div className="flex gap-7 overflow-x-auto border-b pt-5 scrollbar-none" style={{ borderColor: "var(--cc-line)" }}>
                {categories.map(category => {
                    const isActive = (category.id === "all" && !selectedCategory) || selectedCategory === category.id;
                    return (
                        <button
                            key={category.id}
                            type="button"
                            onClick={() => setSelectedCategory(category.id === "all" ? null : category.id)}
                            className={`shrink-0 border-b-2 pb-3 text-sm transition ${isActive ? "border-copper font-semibold cc-text-primary" : "border-transparent cc-text-tertiary"}`}
                        >
                            {category.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
