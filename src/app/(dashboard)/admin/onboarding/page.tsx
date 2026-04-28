"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { 
    UploadCloud, Sparkles, FileText, CheckCircle2, 
    AlertCircle, Users, Save, Trash2, Edit3 
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface ExtractedUser {
    id: string; // ID temporal
    name: string;
    unit_id: string;
    email: string;
    phone: string;
}

export default function AdminOnboardingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [file, setFile] = useState<File | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedUser[] | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Si no es admin, redirigir
    if (user && user.role !== 'admin') {
        router.push('/home');
        return null;
    }

    const processFile = async (uploadedFile: File) => {
        setFile(uploadedFile);
        setIsExtracting(true);
        setExtractedData(null);
        setSyncSuccess(false);

        const formData = new FormData();
        formData.append('file', uploadedFile);

        try {
            const res = await fetch('/api/onboarding/extract', {
                method: 'POST',
                body: formData,
            });
            
            // Si Vercel devuelve un Timeout 504 (HTML) en lugar de JSON, esto explotaba
            const textResponse = await res.text();
            let result: { data?: Partial<ExtractedUser>[], error?: string } | null = null;
            try {
                result = JSON.parse(textResponse);
            } catch (e) {
                throw new Error(`Servidor devolvió un error grave no-JSON (posible Timeout 504 o Archivo muy grande). Respuesta cruda: ${textResponse.substring(0, 50)}...`);
            }
            
            if (res.ok && result?.data) {
                // Asignarle un ID temporal a cada fila para list keys
                const mappedData = result.data.map((row, i: number) => ({
                    id: `temp-${i}`,
                    name: row.name || '',
                    unit_id: row.unit_id || '',
                    email: row.email || '',
                    phone: row.phone || ''
                }));
                setExtractedData(mappedData as ExtractedUser[]);
            } else {
                toast({ title: "Error de extracción", description: (result && result.error) || 'Hubo un error al procesar el archivo con IA.', variant: "destructive" });
                setFile(null);
            }
        } catch (err: unknown) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : 'Falla desconocida';
            toast({ title: "Error de conexión", description: `Timeout o error de red: ${errorMessage}`, variant: "destructive" });
            setFile(null);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (uploadedFile) {
            await processFile(uploadedFile);
        }
        e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isExtracting) return;
        
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
            await processFile(droppedFile);
        }
    };

    const handleFieldChange = (id: string, field: keyof ExtractedUser, value: string) => {
        setExtractedData(prev => 
            prev ? prev.map(row => row.id === id ? { ...row, [field]: value } : row) : null
        );
    };

    const handleDeleteRow = (id: string) => {
        setExtractedData(prev => prev ? prev.filter(row => row.id !== id) : null);
    };

    const [confirmingSync, setConfirmingSync] = useState(false);

    const handleSyncToDatabase = async () => {
        if (!extractedData || extractedData.length === 0) return;

        if (!confirmingSync) {
            setConfirmingSync(true);
            return;
        }

        setConfirmingSync(false);
        setIsSyncing(true);
        try {
            const res = await fetch('/api/onboarding/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ residents: extractedData })
            });

            if (res.ok) {
                setSyncSuccess(true);
                setExtractedData(null);
                setFile(null);
            } else {
                const err = await res.json();
                toast({ title: "Error al sincronizar", description: err.error || 'Error fatal al sincronizar con Supabase.', variant: "destructive" });
            }
        } catch (error: unknown) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "La conexión con Supabase falló.";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-black cc-text-primary flex items-center gap-3">
                    <Sparkles className="h-8 w-8 text-brand-600" />
                    Asistente Mágico de Migración con IA
                </h1>
                <p className="mt-2 text-slate-500 max-w-3xl">
                    Olvídate de tipear usuarios a mano. Sube tu viejo PDF impreso, Excel desordenado o lista de residentes
                    escraneada. Nuestro cerebro de Inteligencia Artificial (Gemini) leerá inteligentemente el desastre, 
                    extraerá los nombres, y poblará la base de datos automáticamente por ti.
                </p>
            </div>

            {/* ZONA DE CARGA */}
            {!extractedData && !syncSuccess && (
                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`bg-surface rounded-3xl p-12 text-center shadow-xl border relative overflow-hidden group transition-all duration-300 ${
                        isDragging 
                            ? 'border-brand-500 scale-[1.02] bg-indigo-50/50 dark:bg-indigo-900/20' 
                            : 'border-indigo-100 dark:border-indigo-500/20'
                    }`}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 opacity-50 z-0"></div>
                    
                    <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
                        <div className={`p-6 rounded-full bg-surface shadow-2xl transition-transform duration-500 ${isExtracting ? 'animate-pulse scale-110' : 'group-hover:scale-110'}`}>
                            {isExtracting ? (
                                <Sparkles className="w-16 h-16 text-brand-600 animate-spin-slow" />
                            ) : (
                                <UploadCloud className="w-16 h-16 text-brand-500" />
                            )}
                        </div>
                        
                        <h3 className="text-2xl font-bold tracking-tight cc-text-primary">
                            {isExtracting ? 'La IA está leyendo y estructurando tu archivo...' : 'Arrastra tu archivo PDF o Word aquí'}
                        </h3>
                        
                        <p className="text-slate-500 font-medium max-w-md mx-auto">
                            {isExtracting 
                                ? 'Esto puede tomar hasta 20 segundos dependiendo del tamaño gigantesco del archivo. No cierres la ventana.' 
                                : 'Soporta nóminas de residentes antiguas, listas de Excel copiadas en texto, o escaneos de OCR.'}
                        </p>

                        {!isExtracting && (
                            <div className="mt-6 relative">
                                <label className="cursor-pointer px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl shadow-lg transition duration-200 inline-flex items-center gap-2 group/btn">
                                    <UploadCloud className="w-5 h-5 group-hover/btn:-translate-y-1 transition" />
                                    Subir Archivo Manualmente
                                    <input 
                                        type="file" 
                                        accept=".pdf,.docx,.doc,.txt,.csv" 
                                        onChange={handleFileUpload} 
                                        disabled={isExtracting}
                                        className="hidden" 
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PANTALLA DE ÉXITO */}
            {syncSuccess && (
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 rounded-3xl p-12 text-center shadow-xl flex flex-col items-center"
                >
                    <div className="h-24 w-24 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg mb-6">
                        <CheckCircle2 className="h-12 w-12" />
                    </div>
                    <h2 className="text-3xl font-black text-success-fg mb-2">¡Sincronización Mágica Completada!</h2>
                    <p className="text-emerald-600 dark:text-emerald-500 font-medium mb-8">Todos los residentes han sido inyectados y creados exitosamente en Supabase de forma estructurada.</p>
                    <button 
                        onClick={() => setSyncSuccess(false)}
                        className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition"
                    >
                        Inyectar Otro Archivo
                    </button>
                </motion.div>
            )}

            {/* DATA GRID INTERACTIVO - REVISIÓN HUMANA */}
            <AnimatePresence>
                {extractedData && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-surface rounded-2xl shadow-xl overflow-hidden border border-subtle"
                    >
                        <div className="bg-slate-900 text-white p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <FileText className="h-6 w-6 text-brand-400" />
                                    Tabla de Triaje para Revisión Humana
                                </h2>
                                <p className="text-sm text-slate-400 mt-1">
                                    La Inteligencia Artificial encontró <strong>{extractedData.length} personas</strong>. Por seguridad corporativa, debes revisar que la IA no haya cometido errores leyendo manchas del PDF. Edita los campos si notas algo raro.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {setExtractedData(null); setFile(null)}}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition"
                                >
                                    Cancelar y Subir Otro
                                </button>
                                <button
                                    onClick={handleSyncToDatabase}
                                    disabled={isSyncing}
                                    className={`px-6 py-2 text-white rounded-lg font-bold shadow-lg flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${confirmingSync ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                                >
                                    {isSyncing
                                        ? <span className="animate-pulse">Guardando en Supabase...</span>
                                        : confirmingSync
                                            ? <><AlertCircle className="h-5 w-5" /> ¿Confirmar? Haz clic de nuevo</>
                                            : <><Save className="h-5 w-5" /> Inyectar a Base de Datos</>
                                    }
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-left text-sm cc-text-secondary">
                                <thead className="bg-canvas/50 text-slate-900 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider border-b border-subtle">
                                    <tr>
                                        <th className="px-6 py-4 w-1/4">Nombre del Residente</th>
                                        <th className="px-6 py-4 w-1/6">Depto / Unidad</th>
                                        <th className="px-6 py-4 w-1/4">Correo Generado/Propio</th>
                                        <th className="px-6 py-4 w-1/6">Teléfono</th>
                                        <th className="px-6 py-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 md:max-h-[60vh] overflow-y-auto w-full block">
                                    {/* Un truco común para que las tablas rolen con 100+ items es display: block en tbody, pero aquí prescindiremos para mantener el flex perfecto width. */}
                                    {extractedData.map((row) => (
                                        <tr key={row.id} className="hover:bg-indigo-50/50 dark:hover:bg-slate-700/30 transition group">
                                            <td className="px-4 py-2">
                                                <input 
                                                    value={row.name} 
                                                    onChange={e => handleFieldChange(row.id, 'name', e.target.value)}
                                                    className="w-full bg-transparent border-none focus:ring-2 focus:ring-brand-500 rounded-lg px-2 py-1 cc-text-primary font-medium"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input 
                                                    value={row.unit_id} 
                                                    onChange={e => handleFieldChange(row.id, 'unit_id', e.target.value)}
                                                    className="w-full bg-slate-100 dark:bg-slate-900 border-none focus:ring-2 focus:ring-brand-500 rounded-lg px-3 py-1 font-mono text-xs"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input 
                                                    value={row.email} 
                                                    onChange={e => handleFieldChange(row.id, 'email', e.target.value)}
                                                    className="w-full bg-transparent border-none focus:ring-2 focus:ring-brand-500 rounded-lg px-2 py-1 cc-text-secondary"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input 
                                                    value={row.phone || ''} 
                                                    onChange={e => handleFieldChange(row.id, 'phone', e.target.value)}
                                                    placeholder="N/A"
                                                    className="w-full bg-transparent border-none focus:ring-2 focus:ring-brand-500 rounded-lg px-2 py-1"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button 
                                                    onClick={() => handleDeleteRow(row.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
                                                    title="Ignorar esta fila"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
