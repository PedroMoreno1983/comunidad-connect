"use client";

import { Search, X, Grid3X3, Smartphone, Armchair, Shirt, Package } from "lucide-react";
import { motion } from "framer-motion";

interface ProductFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    selectedCategory: string | null;
    setSelectedCategory: (cat: string | null) => void;
    categories: { id: string, label: string }[];
    getCategoryConfig: (category: string) => { icon: React.ElementType, gradient: string };
}

export function ProductFilters({
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    categories,
    getCategoryConfig
}: ProductFiltersProps) {
    return (
        <div className="space-y-6">
            {/* Search Bar Premium */}
            <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center">
                    <Search className="absolute left-5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="¿Qué estás buscando para tu hogar hoy?"
                        className="w-full h-14 pl-14 pr-12 rounded-2xl bg-surface/80 backdrop-blur-md border border-subtle/50 cc-text-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-5 p-1 rounded-full hover:bg-elevated text-slate-400"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Category Chips Premium */}
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide pt-2">
                {categories.map((cat, idx) => {
                    const config = getCategoryConfig(cat.id);
                    const Icon = config.icon;
                    const isActive = (cat.id === 'all' && !selectedCategory) || selectedCategory === cat.id;

                    return (
                        <motion.button
                            key={cat.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedCategory(cat.id === 'all' ? null : cat.id)}
                            className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-sm whitespace-nowrap transition-all duration-300 ${isActive
                                ? `bg-gradient-to-r ${config.gradient} text-white shadow-xl shadow-blue-500/25 scale-105 border border-white/20`
                                : 'bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl cc-text-secondary border border-white/50 dark:border-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-800/60 hover:shadow-lg'
                                }`}
                        >
                            <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-white' : 'cc-text-tertiary'}`} />
                            {cat.label}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
