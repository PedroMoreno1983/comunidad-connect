"use client";
/* eslint-disable @next/next/no-img-element -- Provider registration previews a local data URL before upload. */

import { useRef, useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ArrowLeft, Upload, CheckCircle2, Image as ImageIcon, X } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { ModuleFlow } from "@/components/ui/ModuleFlow";

type ProviderCategory = 'plumbing' | 'electrical' | 'locksmith' | 'cleaning' | 'general';

export default function ProviderRegisterPage() {
    const router = useRouter();
    const { toast } = useToast();
    const photoInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        email: '',
        phone: '',
        category: 'plumbing' as ProviderCategory,

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
        newCertification: '',

        // Profile photo
        photo: '',
        photoName: ''
    });

    const handlePhotoFile = (file?: File) => {
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            toast({ title: "Formato no soportado", description: "Sube una imagen JPG, PNG o WebP.", variant: "destructive" });
            return;
        }

        const maxSizeMb = 1.5;
        if (file.size > maxSizeMb * 1024 * 1024) {
            toast({ title: "Imagen demasiado pesada", description: `La foto debe pesar menos de ${maxSizeMb}MB para guardarse correctamente.`, variant: "destructive" });
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            setFormData(prev => ({ ...prev, photo: result, photoName: file.name }));
        };
        reader.onerror = () => {
            toast({ title: "No se pudo leer la imagen", description: "Intenta con otro archivo.", variant: "destructive" });
        };
        reader.readAsDataURL(file);
    };

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
        if (isSubmitting) return;

        const providerData = {
            name: formData.name,
            category: formData.category,
            contactPhone: formData.phone,
            email: formData.email,
            bio: formData.bio,
            yearsExperience: parseInt(formData.yearsExperience, 10) || 0,
            specialties: formData.specialties,
            certifications: formData.certifications,
            hourlyRate: parseFloat(formData.hourlyRate) || 0,
            responseTime: formData.responseTime,
            photo: formData.photo,
        };

        try {
            setIsSubmitting(true);

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
                title: "¿Registro Exitoso!",
                description: "Tu perfil de técnico ha sido creado correctamente.",
                variant: "success",
            });

            router.push(`/services/provider/${data.id}`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar el registro. Intenta nuevamente.";
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
            {/* Back Button */}
            <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm cc-text-secondary hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                Volver a Servicios
            </Link>

            {/* Header */}
            <div className="text-center space-y-3">
                <h1 className="text-3xl font-bold cc-text-primary">
                    Regístrate como <span className="text-brand-600">Técnico Profesional</span>
                </h1>
                <p className="text-lg cc-text-secondary max-w-2xl mx-auto">
                    Une a nuestra plataforma y conecta con cientos de clientes potenciales
                </p>
            </div>

            <ModuleFlow
                title="De perfil a proveedor verificable"
                description="El técnico completa datos básicos, especialidades, certificaciones y foto antes de quedar disponible para recibir solicitudes."
                steps={[
                    "Identificar proveedor",
                    "Completar experiencia",
                    "Adjuntar respaldo visual",
                    "Publicar perfil",
                ]}
                outcome="Cierre esperado: perfil creado, visible en el directorio y disponible para solicitudes con trazabilidad."
                currentStep={step}
                completedSteps={step - 1}
                statusLabel={`Paso ${step} de 3`}
                primaryActionLabel="Completar perfil"
                primaryActionHref="#formulario-proveedor"
                secondaryActionLabel="Volver a servicios"
                secondaryActionHref="/services"
            />

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${s === step
                            ? 'bg-brand-500 text-white shadow-sm'
                            : s < step
                                ? 'bg-emerald-500 text-white'
                                : 'bg-elevated text-slate-400'
                            }`}>
                            {s < step ? <CheckCircle2 className="h-5 w-5" /> : s}
                        </div>
                        {s < 3 && (
                            <div className={`w-16 h-1 rounded-full ${s < step ? 'bg-emerald-500' : 'bg-elevated'}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Form */}
            <form id="formulario-proveedor" onSubmit={handleSubmit} className="scroll-mt-24 bg-surface rounded-lg shadow-sm border border-subtle p-8">
                {/* Step 1: Basic Info */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold cc-text-primary mb-6">Información Básica</h2>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">
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
                                <label className="text-sm font-medium cc-text-secondary">
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
                                <label className="text-sm font-medium cc-text-secondary">
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
                            <label className="text-sm font-medium cc-text-secondary">
                                Categoría Principal *
                            </label>
                            <select
                                required
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value as ProviderCategory })}
                                className="w-full px-4 py-2.5 rounded-xl border border-subtle bg-surface cc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
                            <h2 className="text-2xl font-bold cc-text-primary mb-6">Información Profesional</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium cc-text-secondary">
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
                                <label className="text-sm font-medium cc-text-secondary">
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
                            <label className="text-sm font-medium cc-text-secondary">
                                Tiempo de Respuesta *
                            </label>
                            <select
                                required
                                value={formData.responseTime}
                                onChange={(e) => setFormData({ ...formData, responseTime: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border border-subtle bg-surface cc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                            >
                                <option value="< 30 minutos">Menos de 30 minutos</option>
                                <option value="< 1 hora">Menos de 1 hora</option>
                                <option value="< 2 horas">Menos de 2 horas</option>
                                <option value="< 4 horas">Menos de 4 horas</option>
                                <option value="< 24 horas">Menos de 24 horas</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium cc-text-secondary">
                                Sobre Ti (Biografía) *
                            </label>
                            <textarea
                                required
                                className="w-full min-h-[120px] rounded-xl border border-subtle bg-surface cc-text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                                placeholder="Cuenta sobre tu experiencia, especialidades y que te hace confiable para la comunidad..."
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
                            <h2 className="text-2xl font-bold cc-text-primary mb-6">Especialidades y Certificaciones</h2>
                        </div>

                        {/* Specialties */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium cc-text-secondary">
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
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg text-sm border border-brand-100"
                                        >
                                            {specialty}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSpecialty(idx)}
                                                className="hover:text-brand-900"
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
                            <label className="text-sm font-medium cc-text-secondary">
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
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-warning-bg text-warning-fg rounded-lg text-sm border border-amber-100 dark:border-amber-500/20"
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

                        {/* Photo Upload */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium cc-text-secondary">
                                Foto de Perfil
                            </label>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => photoInputRef.current?.click()}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        photoInputRef.current?.click();
                                    }
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    handlePhotoFile(event.dataTransfer.files?.[0]);
                                }}
                                className="relative cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-default bg-canvas p-6 text-center transition-colors hover:border-brand-400 hover:bg-surface"
                            >
                                <input
                                    ref={photoInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}
                                />

                                {formData.photo ? (
                                    <div className="mx-auto flex max-w-xl items-center gap-4 rounded-lg border border-subtle bg-surface p-4 text-left">
                                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-elevated">
                                            <img src={formData.photo} alt="Foto de perfil seleccionada" className="h-full w-full object-cover" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                                                <ImageIcon className="h-3.5 w-3.5" />
                                                Foto cargada
                                            </div>
                                            <p className="truncate text-sm font-semibold cc-text-primary">{formData.photoName}</p>
                                            <p className="mt-1 text-xs cc-text-secondary">Haz clic o arrastra otra imagen para reemplazarla.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setFormData(prev => ({ ...prev, photo: '', photoName: '' }));
                                                if (photoInputRef.current) photoInputRef.current.value = '';
                                            }}
                                            className="rounded-lg border border-subtle p-2 cc-text-secondary transition-colors hover:bg-elevated"
                                            aria-label="Quitar foto"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="mx-auto mb-3 h-12 w-12 text-slate-400" />
                                        <p className="text-sm cc-text-secondary">
                                            Haz clic para subir una foto o arrastra aqui
                                        </p>
                                        <p className="mt-1 text-xs cc-text-tertiary">
                                            JPG, PNG o WebP hasta 1.5MB
                                        </p>
                                    </>
                                )}
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
                                disabled={formData.specialties.length === 0 || isSubmitting}
                            >
                                {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
                            </Button>
                        </div>
                    </div>
                )}
            </form>

            {/* Info Box */}
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-6">
                <h3 className="mb-2 font-semibold text-brand-900">¿Qué sigue después del registro?</h3>
                <ul className="space-y-2 text-sm text-brand-800">
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
