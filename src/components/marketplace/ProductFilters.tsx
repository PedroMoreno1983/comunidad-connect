"use client";

import { Search, X } from "lucide-react";
import { motion } from "framer-motion";

interface ProductFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    selectedCategory: string | null;
    setSelectedCategory: (cat: string | null) => void;
    categories: { id: string; label: string }[];
    getCategoryConfig: (category: string) => { icon: React.ElementType; gradient: string };
}

export function ProductFilters({
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    categories,
    getCategoryConfig,
}: ProductFiltersProps) {
    return (
        <div className="space-y-4">
            <div className="relative flex items-center">
                <Search className="absolute left-4 h-5 w-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar artículos, categorías o palabras clave..."
                    className="h-12 w-full rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] pl-12 pr-12 text-sm font-medium cc-text-primary shadow-sm transition-all focus:border-[var(--cc-copper)] focus:outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/20"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                />
                {searchTerm && (
                    <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute right-4 rounded-md p-1 text-slate-400 hover:bg-elevated"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
                {categories.map((category, index) => {
                    const config = getCategoryConfig(category.id);
                    const Icon = config.icon;
                    const isActive = (category.id === "all" && !selectedCategory) || selectedCategory === category.id;

                    return (
                        <motion.button
                            key={category.id}
                            type="button"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.03 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedCategory(category.id === "all" ? null : category.id)}
                            className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                                isActive
                                    ? "border-[var(--cc-copper)] bg-[var(--cc-copper)] text-white"
                                    : "border-[var(--cc-line)] bg-[var(--cc-paper)] cc-text-secondary hover:bg-[var(--cc-paper-warm)]"
                            }`}
                        >
                            <Icon className={`h-4 w-4 ${isActive ? "text-white" : "cc-text-tertiary"}`} />
                            {category.label}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
