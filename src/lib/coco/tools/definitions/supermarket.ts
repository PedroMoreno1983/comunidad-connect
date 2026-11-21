import 'server-only';

/** Definiciones de herramientas de CoCo: supermarket. Movidas tal cual desde tools.ts (21-11-2026). */

export const SUPERMARKET_TOOL_DEFINITIONS = [
    {
        name: 'delete_shopping_list',
        description: 'Borra una lista del súper guardada por el residente. Identifícala por título; si hay varias parecidas, la herramienta devuelve la lista para que elija. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string' },
                list_id: { type: 'string', description: 'ID exacto, si una respuesta anterior lo devolvió.' },
            },
            required: [],
        },
    },
    {
        name: 'compare_shopping_list',
        description: 'Compara la lista de supermercado del usuario en todas las tiendas (Jumbo, Lider, Santa Isabel, Unimarc, aCuenta) con precios del catálogo: total por tienda, qué falta y la mejor opción, más el enlace que abre esa lista lista para cargar el carro. Úsala cuando pida comprar, comparar o "hacer la compra". Sin list_id ni body usa su última lista guardada. Solo lectura.',
        input_schema: {
            type: 'object' as const,
            properties: {
                list_id: { type: 'string', description: 'ID de una lista guardada (lo devuelve save_shopping_list).' },
                body: { type: 'string', description: 'Productos y cantidades, si aún no la guardó.' },
            },
            required: [],
        },
    },
    {
        name: 'save_shopping_list',
        description: 'Guarda la lista personal de supermercado del usuario autenticado en Convive. No compra productos ni cobra dinero. Requiere confirmación. Después de guardarla, ofrece compararla con compare_shopping_list.',
        input_schema: {
            type: 'object' as const,
            properties: {
                body: { type: 'string', description: 'Productos y cantidades si se conocen, separados por comas o líneas.' },
                store: { type: 'string', description: 'Supermercado elegido, opcional.' },
            },
            required: ['body'],
        },
    },
    {
        name: 'review_group_order',
        description: 'Aprueba o rechaza una compra comunitaria del supermercado que propuso un vecino. Usa antes list_supermarket_group_orders para el id. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                order_id: { type: 'string' },
                approve: { type: 'boolean' },
                note: { type: 'string', description: 'Nota para el vecino, opcional.' },
                order_title: { type: 'string', description: 'Título, solo para mostrar en la confirmación.' },
            },
            required: ['order_id', 'approve'],
        },
    },
    {
        name: 'list_supermarket_group_orders',
        description: 'Lista las compras grupales reales y sus aportes dentro de la comunidad autenticada.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'compare_supermarket_group_order',
        description: 'Consolida cantidades de una compra grupal y compara canastas vigentes retail y mayoristas.',
        input_schema: {
            type: 'object' as const,
            properties: { order_id: { type: 'string', description: 'ID de la compra grupal.' } },
            required: ['order_id'],
        },
    },
    {
        name: 'create_supermarket_group_order',
        description: 'Crea una compra grupal real para la comunidad. Requiere confirmacion del usuario.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Nombre corto de la compra.' },
                closes_at: { type: 'string', description: 'Fecha de cierre YYYY-MM-DD.' },
                shopping_list: { type: 'string', description: 'Productos y cantidades, por ejemplo: arroz 2, leche 6.' },
            },
            required: ['title', 'closes_at', 'shopping_list'],
        },
    },
    {
        name: 'join_supermarket_group_order',
        description: 'Suma productos y cantidades del usuario a una compra grupal abierta. Requiere confirmacion.',
        input_schema: {
            type: 'object' as const,
            properties: {
                order_id: { type: 'string' },
                shopping_list: { type: 'string', description: 'Productos y cantidades que aporta el usuario.' },
            },
            required: ['order_id', 'shopping_list'],
        },
    },
    {
        name: 'lock_supermarket_group_order',
        description: 'Cierra una compra grupal con la canasta completa del supermercado elegido (sin store, la completa mas barata). Despues el organizador abre el carro desde la app, igual que en la compra individual. Solo organizador o admin; requiere confirmacion.',
        input_schema: {
            type: 'object' as const,
            properties: {
                order_id: { type: 'string' },
                store: { type: 'string', description: 'Supermercado donde comprar, por ejemplo Jumbo o Lider. Usa compare_supermarket_group_order antes para ver cuales estan completos.' },
            },
            required: ['order_id'],
        },
    },
    {
        name: 'record_supermarket_group_purchase',
        description: 'Registra el total de la boleta de una compra grupal ya cerrada. El reparto entre vecinos pasa a calcularse sobre lo realmente pagado. Solo organizador o admin; requiere confirmacion.',
        input_schema: {
            type: 'object' as const,
            properties: {
                order_id: { type: 'string' },
                final_total: { type: 'integer', description: 'Total pagado en pesos, tal como dice la boleta.' },
            },
            required: ['order_id', 'final_total'],
        },
    },
] as const;
