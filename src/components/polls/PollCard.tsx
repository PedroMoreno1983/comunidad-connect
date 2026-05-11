"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, CheckCircle2, Clock, Vote as VoteIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Poll } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

interface PollCardProps {
    poll: Poll;
    onVote?: (optionId: string) => void;
    isAdmin?: boolean;
    initialHasVoted?: boolean;
    initialSelectedOption?: string | null;
}

const categoryLabels: Record<Poll["category"], string> = {
    maintenance: "Mantencion",
    community: "Comunidad",
    rules: "Reglamento",
    other: "Otro",
};

export function PollCard({ poll, onVote, initialHasVoted = false, initialSelectedOption = null }: PollCardProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(initialSelectedOption);
    const [hasVoted, setHasVoted] = useState(initialHasVoted);
    const [now] = useState(() => Date.now());
    const { toast } = useToast();

    const isClosed = poll.status === "closed" || new Date(poll.endDate).getTime() < now;
    const isOptimisticVote = hasVoted && !initialHasVoted;
    const currentTotalVotes = poll.totalVotes + (isOptimisticVote ? 1 : 0);
    const daysLeft = Math.max(0, Math.ceil((new Date(poll.endDate).getTime() - now) / (1000 * 60 * 60 * 24)));
    const showResults = hasVoted || isClosed;

    const getPercentage = (votes: number) => {
        if (currentTotalVotes === 0) return 0;
        return Math.round((votes / currentTotalVotes) * 100);
    };

    const handleVote = () => {
        if (!selectedOption) return;
        setHasVoted(true);
        onVote?.(selectedOption);
        toast({
            title: "Voto registrado",
            description: "Gracias por participar en la decision comunitaria.",
            variant: "success",
        });
    };

    return (
        <article className="flex h-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
            <div className="border-b border-subtle p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-md border border-subtle bg-canvas px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em] cc-text-secondary">
                        {categoryLabels[poll.category] || "Consulta"}
                    </span>
                    <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em] ${isClosed ? "bg-elevated cc-text-secondary" : "bg-success-bg text-success-fg"}`}>
                        {isClosed ? "Cerrada" : "Activa"}
                    </span>
                </div>
                <h3 className="text-lg font-semibold leading-snug cc-text-primary">{poll.title}</h3>
                <p className="mt-2 text-sm leading-6 cc-text-secondary">{poll.description}</p>
            </div>

            <div className="flex-1 space-y-3 p-5">
                {!showResults ? (
                    poll.options.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => setSelectedOption(option.id)}
                            className={`flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${selectedOption === option.id
                                ? "border-brand-500 bg-brand-50 text-brand-700"
                                : "border-subtle bg-canvas cc-text-secondary hover:border-brand-200 hover:bg-elevated"
                            }`}
                        >
                            <span className="text-sm font-semibold">{option.text}</span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selectedOption === option.id ? "border-brand-600 bg-brand-600" : "border-subtle bg-surface"}`}>
                                {selectedOption === option.id && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                            </span>
                        </button>
                    ))
                ) : (
                    poll.options.map((option) => {
                        const optimisticOptionVotes = option.votes + (isOptimisticVote && selectedOption === option.id ? 1 : 0);
                        const percentage = getPercentage(optimisticOptionVotes);
                        return (
                            <div key={option.id} className="rounded-lg border border-subtle bg-canvas p-4">
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
                                <p className="mt-2 text-xs cc-text-secondary">{optimisticOptionVotes} voto(s)</p>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="border-t border-subtle bg-canvas p-5">
                <div className="mb-4 grid gap-3 text-xs font-semibold cc-text-secondary sm:grid-cols-3">
                    <div className="flex items-center gap-2">
                        <VoteIcon className="h-4 w-4" />
                        {currentTotalVotes} votos
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {isClosed ? "Finalizada" : `${daysLeft} dias`}
                    </div>
                    <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        {new Date(poll.endDate).toLocaleDateString("es-CL")}
                    </div>
                </div>

                {!showResults ? (
                    <Button onClick={handleVote} disabled={!selectedOption} className="w-full">
                        <VoteIcon className="h-4 w-4" />
                        Enviar mi voto
                    </Button>
                ) : (
                    <div className="flex items-center justify-center gap-2 rounded-md border border-subtle bg-surface px-4 py-3 text-sm font-semibold text-brand-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {hasVoted ? "Voto procesado" : "Votacion finalizada"}
                    </div>
                )}
            </div>
        </article>
    );
}
