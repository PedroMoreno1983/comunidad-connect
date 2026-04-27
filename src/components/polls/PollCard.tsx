"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2, Clock, Users, ChevronRight,
    BarChart3, Calendar, Info, Vote as VoteIcon
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Poll, PollOption } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

interface PollCardProps {
    poll: Poll;
    onVote?: (optionId: string) => void;
    isAdmin?: boolean;
    initialHasVoted?: boolean;
    initialSelectedOption?: string | null;
}

export function PollCard({ poll, onVote, isAdmin, initialHasVoted = false, initialSelectedOption = null }: PollCardProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(initialSelectedOption);
    const [hasVoted, setHasVoted] = useState(initialHasVoted);
    const { toast } = useToast();

    const handleVote = () => {
        if (!selectedOption) return;
        setHasVoted(true);
        onVote?.(selectedOption);
        toast({
            title: "¡Voto Registrado!",
            description: "Gracias por participar en la comunidad.",
            variant: "success"
        });
    };

    // Prevent double counting if the vote is already in the database
    const isOptimisticVote = hasVoted && !initialHasVoted;
    const currentTotalVotes = poll.totalVotes + (isOptimisticVote ? 1 : 0);

    const getPercentage = (votes: number) => {
        if (currentTotalVotes === 0) return 0;
        return Math.round((votes / currentTotalVotes) * 100);
    };

    const isClosed = poll.status === 'closed' || new Date(poll.endDate) < new Date();

    return (
        <div className="bg-surface rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden h-full flex flex-col">
            <div className="p-8 md:p-10 flex-1 space-y-8">
                {/* Header */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${poll.category === 'maintenance' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
                            poll.category === 'rules' ? 'bg-brand-50 text-brand-600 dark:bg-indigo-500/10 dark:text-indigo-400' :
                                'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                            }`}>
                            {poll.category === 'maintenance' ? 'Mantenimiento' :
                                poll.category === 'rules' ? 'Reglamento' : 'Comunidad'}
                        </span>
                        {isClosed && (
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border border-subtle px-3 py-1.5 rounded-xl">
                                Cerrado
                            </span>
                        )}
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black cc-text-primary leading-tight">{poll.title}</h3>
                        <p className="text-sm font-medium text-slate-400 leading-relaxed">{poll.description}</p>
                    </div>
                </div>

                {/* Options / Results */}
                <div className="space-y-4">
                    <AnimatePresence mode="wait">
                        {!hasVoted && !isClosed ? (
                            <motion.div
                                key="voting"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="space-y-3"
                            >
                                {poll.options.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => setSelectedOption(option.id)}
                                        className={`w-full p-6 rounded-2xl border-2 transition-all flex items-center justify-between group ${selectedOption === option.id
                                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-500/10'
                                            : 'border-subtle hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                                            }`}
                                    >
                                        <span className={`font-bold transition-colors ${selectedOption === option.id ? 'text-blue-600 dark:text-blue-400' : 'cc-text-secondary'
                                            }`}>
                                            {option.text}
                                        </span>
                                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedOption === option.id
                                            ? 'border-blue-600 bg-blue-600'
                                            : 'border-subtle'
                                            }`}>
                                            {selectedOption === option.id && <CheckCircle2 className="h-4 w-4 text-white" />}
                                        </div>
                                    </button>
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="results"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="space-y-6"
                            >
                                {poll.options.map((option) => {
                                    const optimisticOptionVotes = option.votes + (isOptimisticVote && selectedOption === option.id ? 1 : 0);
                                    const percentage = getPercentage(optimisticOptionVotes);
                                    return (
                                        <div key={option.id} className="space-y-2">
                                            <div className="flex justify-between text-sm font-black uppercase tracking-widest text-slate-400 px-1">
                                                <span>{option.text}</span>
                                                <span className="cc-text-primary">{percentage}%</span>
                                            </div>
                                            <div className="h-4 w-full bg-elevated rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${percentage}%` }}
                                                    transition={{ duration: 1, ease: "easeOut" }}
                                                    className={`h-full rounded-full ${poll.category === 'maintenance' ? 'bg-amber-500' :
                                                        poll.category === 'rules' ? 'bg-brand-500' :
                                                            'bg-blue-500'
                                                        }`}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Footer */}
            <div className="p-8 bg-slate-50/50 dark:bg-slate-800/30 border-t border-subtle mt-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-8 w-8 rounded-full border-2 border-white dark:border-slate-900 bg-elevated" />
                            ))}
                        </div>
                        <span className="text-xs font-bold text-slate-400">
                            {currentTotalVotes} votos registrados
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <Clock className="h-4 w-4" />
                        <span>Faltan {Math.max(0, Math.ceil((new Date(poll.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} días</span>
                    </div>
                </div>

                {!hasVoted && !isClosed && (
                    <Button
                        onClick={handleVote}
                        disabled={!selectedOption}
                        className="w-full h-16 rounded-2xl bg-canvas text-white font-black text-lg shadow-xl transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        <VoteIcon className="mr-2 h-5 w-5" />
                        Enviar mi Voto
                    </Button>
                )}

                {(hasVoted || isClosed) && (
                    <div className="text-center py-4 text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                        {hasVoted ? "Voto Procesado con Éxito" : "Votación Finalizada"}
                    </div>
                )}
            </div>
        </div>
    );
}
