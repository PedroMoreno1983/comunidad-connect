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
        <div className="space-y-6">
            <div className="relative group">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex items-center">
                    <Search className="absolute left-5 h-5 w-5 text-slate-400 transition-colors group-focus-within:text-blue-500" />
                    <input
                        type="text"
                        placeholder="¿Qué estás buscando para tu hogar hoy?"
                        className="h-14 w-full rounded-2xl border border-subtle/50 bg-surface/80 pl-14 pr-12 text-lg font-medium cc-text-primary shadow-sm backdrop-blur-md transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={searchTerm}
                        onChange={event => setSearchTerm(event.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            className="absolute right-5 rounded-full p-1 text-slate-400 hover:bg-elevated"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-4 pt-2">
                {categories.map((category, index) => {
                    const config = getCategoryConfig(category.id);
                    const Icon = config.icon;
                    const isActive = (category.id === "all" && !selectedCategory) || selectedCategory === category.id;

                    return (
                        <motion.button
                            key={category.id}
                            type="button"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedCategory(category.id === "all" ? null : category.id)}
                            className={`flex items-center gap-2.5 whitespace-nowrap rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-300 ${
                                isActive
                                    ? `scale-105 border border-white/20 bg-gradient-to-r ${config.gradient} text-white shadow-xl shadow-blue-500/25`
                                    : "border border-white/50 bg-white/60 cc-text-secondary backdrop-blur-xl hover:bg-white/80 hover:shadow-lg dark:border-slate-700/50 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
                            }`}
                        >
                            <Icon className={`h-4.5 w-4.5 ${isActive ? "text-white" : "cc-text-tertiary"}`} />
                            {category.label}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
