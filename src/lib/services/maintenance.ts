/**
 * MaintenanceService: activos, tareas y bitacora de mantenimiento.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    BuildingAsset,
    MaintenanceAdminOverview,
    MaintenanceDashboardData,
    MaintenanceLog,
    MaintenanceServiceRow,
    MaintenanceTask,
    ServiceRequestQueueItem,
} from '../types';
import { mapCocoCase } from './coco-mappers';
import { type DbRow, nullableText, textValue } from './db-row';

function mapBuildingAsset(row: DbRow): BuildingAsset {
    return {
        id: textValue(row.id),
        name: textValue(row.name, "Activo tecnico"),
        category: (textValue(row.category, "other") as BuildingAsset["category"]),
        brand: textValue(row.brand),
        model: textValue(row.model),
        installationDate: textValue(row.installation_date || row.installationDate, new Date().toISOString()),
        location: textValue(row.location, "Sin ubicacion"),
        healthStatus: (textValue(row.health_status || row.healthStatus, "optimal") as BuildingAsset["healthStatus"]),
        lastMaintenance: textValue(row.last_maintenance || row.lastMaintenance, new Date().toISOString()),
        nextMaintenance: textValue(row.next_maintenance || row.nextMaintenance, new Date().toISOString()),
    };
}

function mapMaintenanceLog(row: DbRow): MaintenanceLog {
    return {
        id: textValue(row.id),
        assetId: textValue(row.asset_id || row.assetId),
        taskId: nullableText(row.task_id || row.taskId) || undefined,
        performedBy: textValue(row.performed_by || row.performedBy, "Administración"),
        description: textValue(row.description, "Registro de mantenimiento"),
        cost: Number(row.cost || 0),
        date: textValue(row.date, new Date().toISOString()),
    };
}

function mapMaintenanceTask(row: DbRow): MaintenanceTask {
    return {
        id: textValue(row.id),
        assetId: textValue(row.asset_id || row.assetId),
        title: textValue(row.title, "Tarea de mantenimiento"),
        description: textValue(row.description),
        frequency: (textValue(row.frequency, "monthly") as MaintenanceTask["frequency"]),
        dueDate: textValue(row.due_date || row.dueDate, new Date().toISOString()),
        priority: (textValue(row.priority, "medium") as MaintenanceTask["priority"]),
        status: (textValue(row.status, "pending") as MaintenanceTask["status"]),
    };
}

function mapMaintenanceServiceRow(row: DbRow): MaintenanceServiceRow {
    return {
        id: textValue(row.id),
        service_type: nullableText(row.service_type),
        category: nullableText(row.category),
        description: nullableText(row.description),
        status: nullableText(row.status),
        scheduled_date: nullableText(row.scheduled_date),
        preferred_date: nullableText(row.preferred_date),
        created_at: nullableText(row.created_at),
    };
}

function mapServiceRequestQueueItem(row: DbRow): ServiceRequestQueueItem {
    const provider = row.service_providers as DbRow | null | undefined;
    return {
        id: textValue(row.id),
        provider_id: nullableText(row.provider_id),
        user_id: textValue(row.user_id),
        preferred_date: nullableText(row.preferred_date),
        preferred_time: nullableText(row.preferred_time),
        description: textValue(row.description, "Solicitud tecnica"),
        status: (textValue(row.status, "pending") as ServiceRequestQueueItem["status"]),
        created_at: textValue(row.created_at, new Date().toISOString()),
        service_providers: provider ? {
            name: textValue(provider.name, "Proveedor"),
            category: textValue(provider.category, "general"),
            contact_phone: nullableText(provider.contact_phone),
        } : null,
    };
}

export const MaintenanceService = {
    async getAdminOverview(): Promise<MaintenanceAdminOverview> {
        const [serviceRes, caseRes, assetRes, logRes] = await Promise.all([
            supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(12),
            supabase.from("coco_cases").select("id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at").order("created_at", { ascending: false }).limit(12),
            supabase.from("building_assets").select("id, name, category, brand, model, location, health_status, last_maintenance, next_maintenance, installation_date").order("name", { ascending: true }),
            supabase.from("maintenance_logs").select("id, asset_id, task_id, description, cost, date, performed_by").order("date", { ascending: false }).limit(8),
        ]);

        if (serviceRes.error) throw serviceRes.error;
        if (caseRes.error) throw caseRes.error;
        if (assetRes.error) throw assetRes.error;
        if (logRes.error) throw logRes.error;

        return {
            services: ((serviceRes.data || []) as DbRow[]).map(mapMaintenanceServiceRow),
            cases: ((caseRes.data || []) as DbRow[]).map(mapCocoCase),
            assets: ((assetRes.data || []) as DbRow[]).map(mapBuildingAsset),
            logs: ((logRes.data || []) as DbRow[]).map(mapMaintenanceLog),
        };
    },

    async getDashboardData(): Promise<MaintenanceDashboardData> {
        const [tasksRes, overview, serviceRequestsRes] = await Promise.all([
            supabase.from('maintenance_tasks').select('*'),
            this.getAdminOverview(),
            supabase
                .from('service_requests')
                .select(`
                    id,
                    provider_id,
                    user_id,
                    preferred_date,
                    preferred_time,
                    description,
                    status,
                    created_at,
                    service_providers (
                        name,
                        category,
                        contact_phone
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(8),
        ]);

        if (tasksRes.error) throw tasksRes.error;
        if (serviceRequestsRes.error) throw serviceRequestsRes.error;

        return {
            ...overview,
            tasks: ((tasksRes.data || []) as DbRow[]).map(mapMaintenanceTask),
            serviceRequests: ((serviceRequestsRes.data || []) as DbRow[]).map(mapServiceRequestQueueItem),
        };
    },

    async getAssets(): Promise<BuildingAsset[]> {
        const { data, error } = await supabase
            .from('building_assets')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return ((data || []) as DbRow[]).map(mapBuildingAsset);
    },

    async getAssetLogs(assetId: string): Promise<MaintenanceLog[]> {
        const { data, error } = await supabase
            .from('maintenance_logs')
            .select('*')
            .eq('asset_id', assetId)
            .order('date', { ascending: false });

        if (error) throw error;
        return ((data || []) as DbRow[]).map(mapMaintenanceLog);
    },

    async createServiceTask(payload: {
        requesterId?: string;
        unitId?: string;
        serviceType: string;
        title: string;
        description: string;
        scheduledDate?: string;
    }) {
        const { error } = await supabase.from("service_requests").insert({
            requester_id: payload.requesterId,
            unit_id: payload.unitId || "administracion",
            service_type: payload.serviceType,
            description: `[${payload.title}] ${payload.description}`,
            status: "pending",
            scheduled_date: payload.scheduledDate || null,
            scheduled_time: null,
        });

        if (error) throw error;
    },

    async closeService(id: string) {
        const { error } = await supabase.from("service_requests").update({ status: "completed" }).eq("id", id);
        if (error) throw error;
    },

    async completeTask(taskId: string) {
        const { error } = await supabase.from('maintenance_tasks').update({ status: 'completed' }).eq('id', taskId);
        if (error) throw error;
    },
};
