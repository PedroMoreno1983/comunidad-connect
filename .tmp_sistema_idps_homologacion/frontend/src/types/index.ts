// Tipos principales del Sistema IDPS

export interface Item {
  id: string;
  texto: string;
  actor: string;
  dimension: string;
  subdimension?: string;
  estado: 'activo' | 'en_revision' | 'deprecado';
  fecha_creacion: string;
  dificultad_promedio?: number;
  discriminacion_promedio?: number;
}

export interface Variante {
  id: string;
  id_canonico: string;
  texto: string;
  tipo_variante: 'menor' | 'sustantiva';
  anio_aparicion: number;
}

export interface Ocurrencia {
  id: string;
  id_variante: string;
  anio_aplicacion: number;
  formulario: string;
  posicion_formulario: number;
  texto_original: string;
}

export interface Resultado {
  id: string;
  id_ocurrencia: string;
  anio: number;
  metodo: 'clasico' | 'irt';
  dificultad?: number;
  discriminacion?: number;
  p_valor?: number;
  muestra: number;
}

export interface Actor {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
}

export interface Dimension {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
}

export interface Subdimension {
  id: string;
  id_dimension: string;
  codigo: string;
  nombre: string;
}

export interface BusquedaParams {
  q?: string;
  actor?: string;
  dimension?: string;
  subdimension?: string;
  anio?: number;
  estado?: string;
  page?: number;
  limit?: number;
}

export interface PaginacionResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface PropuestaGeneracion {
  id: string;
  texto_propuesto: string;
  actor_sugerido: string;
  dimension_sugerida: string;
  subdimension_sugerida?: string;
  confianza: number;
  estado: 'borrador' | 'aprobado' | 'rechazado';
  fecha_creacion: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'revisor' | 'consulta';
}
