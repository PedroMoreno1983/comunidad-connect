/**
 * Un solo inventario de herramientas: las de CoCo y las del Agent Center.
 * Si un nombre existe en los dos, el riesgo tiene que coincidir.
 */

import { TOOL_DEFINITIONS, MUTATING_TOOLS } from '@/lib/coco/tools';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { AGENT_TOOL_NAMES, READ_ONLY_AGENT_TOOLS, TOOL_RISK_LEVELS, type ToolName, type ToolRiskLevel } from '@/lib/agent-center/domain';

export type CatalogEntry = {
    name: string;
    source: 'coco' | 'agent-center';
    risk: ToolRiskLevel;
    mutating: boolean;
};

export function cocoCatalog(): CatalogEntry[] {
    return (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(tool => ({
        name: tool.name,
        source: 'coco',
        risk: cocoToolRisk(tool.name),
        mutating: MUTATING_TOOLS.has(tool.name),
    }));
}

export function agentCenterCatalog(): CatalogEntry[] {
    return AGENT_TOOL_NAMES.map(name => ({
        name,
        source: 'agent-center' as const,
        risk: TOOL_RISK_LEVELS[name],
        mutating: !READ_ONLY_AGENT_TOOLS.includes(name),
    }));
}

export function unifiedToolCatalog(): CatalogEntry[] {
    return [...cocoCatalog(), ...agentCenterCatalog()];
}

/** Nombres presentes en los dos lados cuyo riesgo no coincide. */
export function conflictingSharedTools(): string[] {
    const coco = new Map(cocoCatalog().map(entry => [entry.name, entry.risk]));
    return (Object.keys(TOOL_RISK_LEVELS) as ToolName[])
        .filter(name => coco.has(name) && coco.get(name) !== TOOL_RISK_LEVELS[name]);
}
