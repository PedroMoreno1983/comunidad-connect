"use client";

import { useState } from "react";
import { Check, MessageSquare, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { groupThreads } from "@/lib/coco/threadGroups";
import type { CoCoThread } from "@/lib/types";

interface Props {
    threads: CoCoThread[];
    activeId: string | null;
    disabled: boolean;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onRename: (id: string, title: string) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
    onDelete: (id: string) => void;
}

/**
 * Lista de conversaciones de CoCo, como en los chats conocidos: fijadas arriba,
 * el resto por fecha, con buscador y acciones por conversación.
 */
export function CoCoThreadSidebar({ threads, activeId, disabled, onSelect, onCreate, onRename, onTogglePin, onDelete }: Props) {
    const [query, setQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const groups = groupThreads(threads.filter(thread => !thread.empty || thread.id === activeId), query);

    const startRename = (thread: CoCoThread) => {
        setEditingId(thread.id);
        setDraft(thread.title);
    };
    const commitRename = () => {
        if (editingId && draft.trim()) onRename(editingId, draft.trim());
        setEditingId(null);
    };

    return (
        <nav aria-label="Conversaciones con CoCo" className="flex h-full flex-col gap-3 p-3">
            <button
                type="button"
                onClick={onCreate}
                disabled={disabled}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/50 px-3 py-2.5 text-sm font-semibold text-brand-300 hover:bg-brand-500/10 disabled:opacity-40"
            >
                <Plus className="h-4 w-4" /> Nueva conversación
            </button>
            <label className="relative block">
                <span className="sr-only">Buscar conversaciones</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Buscar"
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-brand-500/50 focus:outline-none"
                />
            </label>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {groups.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-slate-500">
                        {query ? "Ninguna conversación coincide." : "Tus conversaciones aparecerán aquí."}
                    </p>
                )}
                {groups.map(group => (
                    <section key={group.label}>
                        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{group.label}</p>
                        <ul className="space-y-0.5">
                            {group.threads.map(thread => {
                                const active = thread.id === activeId;
                                const editable = thread.id !== "legacy";
                                if (editingId === thread.id) {
                                    return (
                                        <li key={thread.id}>
                                            <form
                                                className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1"
                                                onSubmit={event => { event.preventDefault(); commitRename(); }}
                                            >
                                                <input
                                                    autoFocus
                                                    value={draft}
                                                    maxLength={80}
                                                    onChange={event => setDraft(event.target.value)}
                                                    onKeyDown={event => { if (event.key === "Escape") setEditingId(null); }}
                                                    aria-label="Nuevo nombre de la conversación"
                                                    className="min-w-0 flex-1 bg-transparent text-xs text-white focus:outline-none"
                                                />
                                                <button type="submit" aria-label="Guardar nombre" className="rounded p-1 text-emerald-300 hover:bg-white/10"><Check className="h-3.5 w-3.5" /></button>
                                                <button type="button" aria-label="Cancelar" onClick={() => setEditingId(null)} className="rounded p-1 text-slate-400 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
                                            </form>
                                        </li>
                                    );
                                }
                                return (
                                    <li key={thread.id} className="group relative">
                                        <button
                                            type="button"
                                            onClick={() => onSelect(thread.id)}
                                            disabled={disabled}
                                            aria-current={active ? "page" : undefined}
                                            title={thread.title}
                                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs disabled:opacity-40 ${active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"} ${editable ? "pr-20" : ""}`}
                                        >
                                            {thread.pinned
                                                ? <Pin className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                                                : <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                                            <span className="truncate">{thread.title}</span>
                                        </button>
                                        {editable && (
                                            <div className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
                                                <button type="button" disabled={disabled} onClick={() => onTogglePin(thread.id, !thread.pinned)} aria-label={thread.pinned ? "Desfijar conversación" : "Fijar conversación"} title={thread.pinned ? "Desfijar" : "Fijar"} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
                                                    {thread.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                                </button>
                                                <button type="button" disabled={disabled} onClick={() => startRename(thread)} aria-label="Renombrar conversación" title="Renombrar" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button type="button" disabled={disabled} onClick={() => onDelete(thread.id)} aria-label="Borrar conversación" title="Borrar" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-rose-300">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </nav>
    );
}
