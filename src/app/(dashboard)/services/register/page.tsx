"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ArrowLeft, Upload, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";

export default function ProviderRegisterPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        email: '',
        phone: '',
        category: 'plumbing' as const,

        // Professional Info
        yearsExperience: '',
        bio: '',
        hourlyRate: '',
        responseTime: '< 2 horas',

        // Specialties
        specialties: [] as string[],
        newSpecialty: '',

        // Certifications
        certifications: [] as string[],
        newCertification: ''
    });

    const handleAddSpecialty = () => {
        if (formData.newSpecialty.trim()) {
            setFormData({
                ...formData,
                specialties: [...formData.specialties, formData.newSpecialty.trim()],
                newSpecialty: ''
            });
        }
    };

    const handleRemoveSpecialty = (index: number) => {
        setFormData({
            ...formData,
            specialties: formData.specialties.filter((_, i) => i !== index)
        });
    };

    const handleAddCertification = () => {
        if (formData.newCertification.trim()) {
            setFormData({
                ...formData,
                certifications: [...formData.certifications, formData.newCertification.trim()],
                newCertification: ''
            });
        }
    };

    const handleRemoveCertification = (index: number) => {
        setFormData({
            ...formData,
            certifications: formData.certifications.filter((_, i) => i !== index)
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Simple client-side mock submission for now
        // In production, this would make an API call to create the provider
        const providerData = {
            name: formData.name,
            category: formData.category,
            contactPhone: formData.phone,
            email: formData.email,
            bio: formData.bio,
            yearsExperience: parseInt(formData.yearsExperience),
            specialties: formData.specialties,
            certifications: formData.certifications,
            hourlyRate: parseFloat(formData.hourlyRate) || 0,
        };

        try {
            const response = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(providerData),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al registrar técnico');
            }

            toast({
                title: "¡Registro Exitoso!",
                description: "Tu perfil de técnico ha sido creado correctamente.",
                variant: "success",
            });

            // Redirect to the provider profile
            router.push(`/services/provider/${data.id}`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar el registro. Intenta nuevamente.";
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
        }
    };

    const getCategoryLabel = (cat: string) => {
        const labels = {
            plumbing: 'Gasfitería',
            electrical: 'Electricidad',
            locksmith: 'Cerrajería'
        };
        return labels[cat as keyof typeof labels] || cat;
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Back Button */}
            <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                Volver a Servicios
            </Link>

            {/* Header */}
            <div className="text-center space-y-3">
                <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
                    Regístrate como <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600">Técnico Profesional</span>
                </h1>
                <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                    Une a nuestra plataforma y conecta con cientos de clientes potenciales
                </p>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${s === step
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                            : s < step
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                            }`}>
                            {s < step ? <CheckCircle2 className="h-5 w-5" /> : s}
                        </div>
                        {s < 3 && (
                            <div className={`w-16 h-1 rounded-full ${s < step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
                {/* Step 1: Basic Info */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Información Básica</h2>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Nombre Completo *
                            </label>
                            <Input
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Juan Pérez"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Email *
                                </label>
                                <Input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="juan@ejemplo.cl"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Teléfono *
                                </label>
                                <Input
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="+56 9 1234 5678"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Categoría Principal *
                            </label>
                            <select
                                required
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="plumbing">Gasfitería</option>
                                <option value="electrical">Electricidad</option>
                                <option value="locksmith">Cerrajería</option>
                            </select>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button
                                type="button"
                                onClick={() => setStep(2)}
                            >
                                Siguiente
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 2: Professional Info */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Información Profesional</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Años de Experiencia *
                                </label>
                                <Input
                                    type="number"
                                    required
                                    min="0"
                                    value={formData.yearsExperience}
                                    onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
                                    placeholder="10"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Tarifa por Hora (CLP)
                                </label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.hourlyRate}
                                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                                    placeholder="15000"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Tiempo de Respuesta *
                            </label>
                            <select
                                required
                                value={formData.responseTime}
                                onChange={(e) => setFormData({ ...formData, responseTime: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="< 30 minutos">Menos de 30 minutos</option>
                                <option value="< 1 hora">Menos de 1 hora</option>
                                <option value="< 2 horas">Menos de 2 horas</option>
                                <option value="< 4 horas">Menos de 4 horas</option>
                                <option value="< 24 horas">Menos de 24 horas</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Sobre Ti (Biografía) *
                            </label>
                            <textarea
                                required
                                className="w-full min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Cuenta sobre tu experiencia, especialidades y qué te hace único..."
                                value={formData.bio}
                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-between pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep(1)}
                            >
                                Atrás
                            </Button>
                            <Button
                                type="button"
                                onClick={() => setStep(3)}
                            >
                                Siguiente
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Specialties & Certifications */}
                {step === 3 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Especialidades y Certificaciones</h2>
                        </div>

                        {/* Specialties */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Especialidades *
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={formData.newSpecialty}
                                    onChange={(e) => setFormData({ ...formData, newSpecialty: e.target.value })}
                                    placeholder="Ej: Reparación de cañerías"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddSpecialty();
                                        }
                                    }}
                                />
                                <Button type="button" variant="outline" onClick={handleAddSpecialty}>
                                    Agregar
                                </Button>
                            </div>
                            {formData.specialties.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {formData.specialties.map((specialty, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-lg text-sm border border-blue-100 dark:border-blue-500/20"
                                        >
                                            {specialty}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSpecialty(idx)}
                                                className="hover:text-blue-900 dark:hover:text-blue-300"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Certifications */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Certificaciones
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={formData.newCertification}
                                    onChange={(e) => setFormData({ ...formData, newCertification: e.target.value })}
                                    placeholder="Ej: Certificación SEC Clase A"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddCertification();
                                        }
                                    }}
                                />
                                <Button type="button" variant="outline" onClick={handleAddCertification}>
                                    Agregar
                                </Button>
                            </div>
                            {formData.certifications.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {formData.certifications.map((cert, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg text-sm border border-amber-100 dark:border-amber-500/20"
                                        >
                                            {cert}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveCertification(idx)}
                                                className="hover:text-amber-900 dark:hover:text-amber-300"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Photo Upload Placeholder */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Foto de Perfil
                            </label>
                            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer">
                                <Upload className="h-12 w-12 mx-auto mb-3 text-slate-400" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Haz clic para subir una foto o arrastra aquí
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    JPG, PNG hasta 5MB
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-between pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep(2)}
                            >
                                Atrás
                            </Button>
                            <Button
                                type="submit"
                                disabled={formData.specialties.length === 0}
                            >
                                Enviar Solicitud
                            </Button>
                        </div>
                    </div>
                )}
            </form>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 dark:text-blue-400 mb-2">¿Qué sigue después del registro?</h3>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                    <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <span>Revisaremos tu perfil en 24-48 horas</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <span>Te contactaremos para verificar tus certificaciones</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <span>Una vez aprobado, tu perfil estará visible para clientes</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
