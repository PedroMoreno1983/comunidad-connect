/**
 * WaterService: lecturas de agua, consumo por unidad e integracion IoT.
 *
 * Extraído de `src/lib/api.ts`, que reexporta este servicio para no romper
 * a quienes lo importan desde `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    Unit,
    User,
    WaterReading,
} from '../types';

export type UnitAssignmentProfile = {
    id: string;
    name: string;
    email: string;
    role: string;
};

export type UnitWithResident = Unit & {
    profiles?: { name: string; email: string } | null;
    share_permille?: number | string | null;
    unit_number?: string;
};

// ==========================================
// Water Consumption API
// ==========================================

export const WaterService = {
    // Obtener lecturas de una unidad específica
    async getReadingsByUnit(unitId: string) {
        const { data, error } = await supabase
            .from('water_readings')
            .select('*')
            .eq('unit_id', unitId)
            .order('reading_date', { ascending: true }); // Ordenar por fecha

        if (error) throw error;
        return data as WaterReading[];
    },

    // Guardar una nueva lectura (Admin)
    async saveReading(reading: Partial<WaterReading>) {
        const { data, error } = await supabase
            .from('water_readings')
            .insert(reading)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Obtener todas las unidades (con sus perfiles de residentes si existen)
    async getUnits(): Promise<UnitWithResident[]> {
        const { data, error } = await supabase
            .from('units')
            .select(`
                *,
                profiles:owner_id (name, email)
            `);

        if (error) {
            console.error('Error loading units:', error);
            // Return empty array instead of throwing so the page shows empty state
            return [];
        }
        return ((data || []) as UnitWithResident[])
            .sort((a, b) => {
                const towerA = String(a.tower || "");
                const towerB = String(b.tower || "");
                const numberA = String(a.number || a.unit_number || "");
                const numberB = String(b.number || b.unit_number || "");
                return towerA.localeCompare(towerB, "es") || numberA.localeCompare(numberB, "es", { numeric: true });
            });
    },

    // Crear nueva unidad. Acepta columnas crudas (snake_case) como share_permille.
    async createUnit(unit: Partial<Unit> & { share_permille?: number | null }) {
        const { data, error } = await supabase
            .from('units')
            .insert(unit)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Actualizar campos de una unidad (p. ej. la alícuota share_permille).
    async updateUnit(unitId: string, patch: Record<string, unknown>) {
        const { data, error } = await supabase
            .from('units')
            .update(patch)
            .eq('id', unitId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Asignar residente a unidad (Actualiza units y opcionalmente user metadata si fuese necesario, 
    // pero por ahora la fuente de verdad es la tabla units)
    async assignResident(unitId: string, residentId: string | null) {
        const { error } = await supabase
            .from('units')
            .update({ owner_id: residentId })
            .eq('id', unitId);

        if (error) throw error;
    },

    // Obtener lista de perfiles (para dropdown de asignación)
    async getProfiles(): Promise<UnitAssignmentProfile[]> {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role')
            .order('name', { ascending: true });

        if (error) throw error;
        return (data || []) as UnitAssignmentProfile[];
    },

    // Obtener el promedio de consumo del edificio (para comparación)
    async getUnitResident(unit: Unit): Promise<User | null> {
        const rawUnit = unit as Unit & { owner_id?: string; tenant_id?: string };
        const userId = unit.ownerId || unit.tenantId || rawUnit.owner_id || rawUnit.tenant_id;
        if (!userId) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role, avatar_url')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        const row = data as Record<string, unknown>;
        return {
            id: String(row.id),
            name: String(row.name || row.email || "Residente"),
            email: String(row.email || ""),
            role: (row.role === "admin" || row.role === "concierge" ? row.role : "resident") as User["role"],
            photo: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
        };
    },

    async getBuildingAverage(month: string, year: number) {
        type AverageReadingRow = { unit_id: string | number | null; reading_value: string | number | null };
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
        ];
        const monthIndex = monthNames.findIndex(item => item.toLowerCase() === month.toLowerCase());
        const previousDate = monthIndex >= 0
            ? new Date(year, monthIndex - 1, 1)
            : new Date(year, new Date().getMonth() - 1, 1);
        const previousMonth = monthNames[previousDate.getMonth()];
        const previousYear = previousDate.getFullYear();

        const { data: currentReadings, error: currentError } = await supabase
            .from('water_readings')
            .select('unit_id, reading_value')
            .eq('month', month)
            .eq('year', year);

        if (currentError) throw currentError;
        if (!currentReadings || currentReadings.length === 0) return 0;

        // Calcula consumo real comparando contra la lectura del periodo anterior.
        const { data: previousReadings, error: previousError } = await supabase
            .from('water_readings')
            .select('unit_id, reading_value')
            .eq('month', previousMonth)
            .eq('year', previousYear);

        if (previousError) throw previousError;

        const currentRows = currentReadings as AverageReadingRow[];
        const previousRows = (previousReadings || []) as AverageReadingRow[];
        const previousByUnit = new Map<string, number>(
            previousRows.map(row => [String(row.unit_id), Number(row.reading_value) || 0])
        );
        const consumptions = currentRows
            .map((row): number | null => {
                const currentValue = Number(row.reading_value) || 0;
                const previousValue = previousByUnit.get(String(row.unit_id));
                return previousValue === undefined ? null : Math.max(0, currentValue - previousValue);
            })
            .filter((value): value is number => value !== null);

        if (consumptions.length > 0) {
            const totalConsumption = consumptions.reduce((acc, value) => acc + value, 0);
            return totalConsumption / consumptions.length;
        }

        const fallbackTotal = currentRows.reduce((acc, curr) => acc + (Number(curr.reading_value) || 0), 0);
        return fallbackTotal / currentRows.length;
    }
};
