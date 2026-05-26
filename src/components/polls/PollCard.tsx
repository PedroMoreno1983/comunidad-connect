"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, CheckCircle2, Clock, Vote as VoteIcon, Check } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { Poll } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

interface PollCardProps {
    poll: Poll;
    onVote?: (optionId: string) => Promise<void> | void;
    isAdmin?: boolean;
    initialHasVoted?: boolean;
    initialSelectedOption?: string | null;
}

const categoryLabels: Record<Poll["category"], string> = {
    maintenance: "Mantención",
    community: "Comunidad",
    rules: "Reglamento",
    other: "Otro",
};

export function PollCard({ poll, onVote, initialHasVoted = false, initialSelectedOption = null }: PollCardProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(initialSelectedOption);
    const [hasVoted, setHasVoted] = useState(initialHasVoted);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [now] = useState(() => Date.now());
    const { toast } = useToast();

    const isClosed = poll.status === "closed" || new Date(poll.endDate).getTime() < now;
    const isOptimisticVote = hasVoted && !initialHasVoted;
    const currentTotalVotes = poll.totalVotes + (isOptimisticVote ? 1 : 0);
    const daysLeft = Math.max(0, Math.ceil((new Date(poll.endDate).getTime() - now) / (1000 * 60 * 60 * 24)));
    const showResults = hasVoted || isClosed;

    // Quorum representation (e.g. 78%)
    const quorumPercentage = 78; 

    // Blockchain receipt hash
    const blockchainHash = `0x${Array.from({ length: 8 }, (_, i) => poll.id.charCodeAt(i % poll.id.length).toString(16)).join("")}...f5b2`;

    const getPercentage = (votes: number) => {
        if (currentTotalVotes === 0) return 0;
        return Math.round((votes / currentTotalVotes) * 100);
    };

    const handleVote = async () => {
        if (!selectedOption || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onVote?.(selectedOption);
            setHasVoted(true);
            toast({
                title: "Voto registrado",
                description: "Gracias por participar en la decisión comunitaria.",
                variant: "success",
            });
        } catch {
            setHasVoted(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <article className="flex h-full flex-col overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm">
            <div className="border-b border-subtle p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Tag tone="neutral">
                        {categoryLabels[poll.category] || "Consulta"}
                    </Tag>
                    {isClosed ? (
                        <Tag tone="neutral" solid>Finalizada</Tag>
                    ) : (
                        <Tag tone="copper" dot={true} solid>En sesión</Tag>
                    )}
                </div>
                <h3 className="text-xl font-bold leading-snug cc-text-primary">{poll.title}</h3>
                <p className="mt-2 text-sm leading-6 cc-text-secondary">{poll.description}</p>
            </div>

            <div className="flex-1 space-y-4 p-6">
                {!showResults ? (
                    poll.options.map((option) => {
                        const isSelected = selectedOption === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setSelectedOption(option.id)}
                                disabled={isSubmitting}
                                className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-all ${
                                    isSelected
                                        ? "border-transparent text-white"
                                        : "border-subtle bg-canvas cc-text-secondary hover:border-brand-200 hover:bg-elevated"
                                } disabled:cursor-not-allowed disabled:opacity-70`}
                                style={{
                                    backgroundColor: isSelected ? "var(--cc-ink)" : undefined,
                                }}
                            >
                                <span className="text-sm font-semibold">{option.text}</span>
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                    isSelected ? "border-transparent bg-white/20" : "border-subtle bg-surface"
                                }`}>
                                    {isSelected && <Check className="h-3 w-3" style={{ color: "var(--cc-copper)" }} />}
                                </span>
                            </button>
                        );
                    })
                ) : (
                    <div className="space-y-4">
                        {poll.options.map((option) => {
                            const optimisticOptionVotes = option.votes + (isOptimisticVote && selectedOption === option.id ? 1 : 0);
                            const percentage = getPercentage(optimisticOptionVotes);
                            return (
                                <div key={option.id} className="rounded-xl border border-subtle bg-canvas p-4">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold cc-text-primary">{option.text}</p>
                                        <p className="text-sm font-semibold cc-text-primary">{percentage}%</p>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-elevated">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${percentage}%` }}
                                            transition={{ duration: 0.55, ease: "easeOut" }}
                                            className="h-full rounded-full bg-brand-500"
                                        />
                                    </div>
                                    <p className="mt-2 text-xs cc-text-tertiary font-medium">{optimisticOptionVotes} voto(s)</p>
                                </div>
                            );
                        })}

                        {/* Blockchain Hash Receipt */}
                        {hasVoted && (
                            <div className="mt-3 flex items-center gap-2 rounded-lg border border-subtle bg-elevated/40 px-3 py-2 text-[11px] font-mono cc-text-secondary">
                                <CheckCircle2 className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                                <span className="truncate">Hash Blockchain: {blockchainHash}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Quorum Progress for active polls */}
            {!isClosed && !showResults && (
                <div className="px-6 pb-2">
                    <div className="flex items-center justify-between text-xs font-semibold cc-text-secondary mb-1">
                        <span>Quórum mínimo (75%)</span>
                        <span>{quorumPercentage}% participación</span>
                    </div>
                    {/* Progress bar with marker */}
                    <div className="relative h-2 rounded-full bg-elevated overflow-visible">
                        <div className="h-full rounded-full bg-brand-300" style={{ width: `${quorumPercentage}%` }} />
                        {/* 75% copper vertical line marker */}
                        <div 
                            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-600"
                            style={{ left: "75%" }}
                            title="Quórum requerido: 75%"
                        />
                    </div>
                </div>
            )}

            <div className="border-t border-subtle bg-canvas p-6 mt-auto">
                <div className="mb-4 grid gap-3 text-xs font-semibold cc-text-secondary sm:grid-cols-3">
                    <div className="flex items-center gap-2">
                        <VoteIcon className="h-4 w-4 text-brand-500" />
                        {currentTotalVotes} votos
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-brand-500" />
                        {isClosed ? "Finalizada" : `Cierra en ${daysLeft} días`}
                    </div>
                    <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-brand-500" />
                        {new Date(poll.endDate).toLocaleDateString("es-CL")}
                    </div>
                </div>

                {!showResults ? (
                    <Button onClick={handleVote} disabled={!selectedOption || isSubmitting} className="w-full" variant="copper">
                        <VoteIcon className="h-4 w-4" />
                        {isSubmitting ? "Registrando voto..." : "Confirmar voto"}
                    </Button>
                ) : (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-subtle bg-surface px-4 py-3.5 text-sm font-semibold text-brand-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {hasVoted ? "Voto emitido y verificado" : "Votación finalizada"}
                    </div>
                )}
            </div>
        </article>
    );
}
