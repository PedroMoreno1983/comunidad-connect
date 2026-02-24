/**
 * Database types generated from Supabase schema
 * To regenerate: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/database.types.ts
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    name: string
                    email: string
                    role: 'admin' | 'resident' | 'concierge'
                    unit_id: string | null
                    avatar_url: string | null
                    created_at: string
                }
                Insert: {
                    id: string
                    name: string
                    email: string
                    role?: 'admin' | 'resident' | 'concierge'
                    unit_id?: string | null
                    avatar_url?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    email?: string
                    role?: 'admin' | 'resident' | 'concierge'
                    unit_id?: string | null
                    avatar_url?: string | null
                    created_at?: string
                }
            }
            units: {
                Row: {
                    id: string
                    number: string
                    floor: number
                    owner_id: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    number: string
                    floor: number
                    owner_id?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    number?: string
                    floor?: number
                    owner_id?: string | null
                    created_at?: string
                }
            }
            marketplace_items: {
                Row: {
                    id: string
                    title: string
                    description: string
                    price: number
                    category: 'electronics' | 'furniture' | 'clothing' | 'other'
                    seller_id: string
                    status: 'available' | 'sold'
                    image_url: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    title: string
                    description: string
                    price: number
                    category: 'electronics' | 'furniture' | 'clothing' | 'other'
                    seller_id: string
                    status?: 'available' | 'sold'
                    image_url?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    title?: string
                    description?: string
                    price?: number
                    category?: 'electronics' | 'furniture' | 'clothing' | 'other'
                    seller_id?: string
                    status?: 'available' | 'sold'
                    image_url?: string | null
                    created_at?: string
                }
            }
            service_providers: {
                Row: {
                    id: string
                    name: string
                    category: 'plumbing' | 'electrical' | 'locksmith' | 'cleaning' | 'general'
                    rating: number
                    contact_phone: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    category: 'plumbing' | 'electrical' | 'locksmith' | 'cleaning' | 'general'
                    rating: number
                    contact_phone: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    category?: 'plumbing' | 'electrical' | 'locksmith' | 'cleaning' | 'general'
                    rating?: number
                    contact_phone?: string
                    created_at?: string
                }
            }
            service_requests: {
                Row: {
                    id: string
                    requester_id: string
                    unit_id: string
                    provider_id: string | null
                    service_type: string
                    description: string
                    status: 'pending' | 'approved' | 'in-progress' | 'completed' | 'cancelled'
                    scheduled_date: string | null
                    scheduled_time: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    requester_id: string
                    unit_id: string
                    provider_id?: string | null
                    service_type: string
                    description: string
                    status?: 'pending' | 'approved' | 'in-progress' | 'completed' | 'cancelled'
                    scheduled_date?: string | null
                    scheduled_time?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    requester_id?: string
                    unit_id?: string
                    provider_id?: string | null
                    service_type?: string
                    description?: string
                    status?: 'pending' | 'approved' | 'in-progress' | 'completed' | 'cancelled'
                    scheduled_date?: string | null
                    scheduled_time?: string | null
                    created_at?: string
                }
            }
            amenities: {
                Row: {
                    id: string
                    name: string
                    description: string
                    max_capacity: number
                    hourly_rate: number
                    icon_name: string
                    gradient: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    description: string
                    max_capacity: number
                    hourly_rate: number
                    icon_name: string
                    gradient: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string
                    max_capacity?: number
                    hourly_rate?: number
                    icon_name?: string
                    gradient?: string
                    created_at?: string
                }
            }
            bookings: {
                Row: {
                    id: string
                    amenity_id: string
                    user_id: string
                    date: string
                    start_time: string
                    end_time: string
                    status: 'pending' | 'confirmed' | 'cancelled'
                    created_at: string
                }
                Insert: {
                    id?: string
                    amenity_id: string
                    user_id: string
                    date: string
                    start_time: string
                    end_time: string
                    status?: 'pending' | 'confirmed' | 'cancelled'
                    created_at?: string
                }
                Update: {
                    id?: string
                    amenity_id?: string
                    user_id?: string
                    date?: string
                    start_time?: string
                    end_time?: string
                    status?: 'pending' | 'confirmed' | 'cancelled'
                    created_at?: string
                }
            }
            announcements: {
                Row: {
                    id: string
                    title: string
                    content: string
                    author_id: string
                    priority: 'info' | 'alert' | 'event'
                    created_at: string
                }
                Insert: {
                    id?: string
                    title: string
                    content: string
                    author_id: string
                    priority?: 'info' | 'alert' | 'event'
                    created_at?: string
                }
                Update: {
                    id?: string
                    title?: string
                    content?: string
                    author_id?: string
                    priority?: 'info' | 'alert' | 'event'
                    created_at?: string
                }
            }
            expenses: {
                Row: {
                    id: string
                    unit_id: string
                    month: string
                    amount: number
                    status: 'paid' | 'pending' | 'overdue'
                    due_date: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    unit_id: string
                    month: string
                    amount: number
                    status?: 'paid' | 'pending' | 'overdue'
                    due_date: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    unit_id?: string
                    month?: string
                    amount?: number
                    status?: 'paid' | 'pending' | 'overdue'
                    due_date?: string
                    created_at?: string
                }
            }
            visitors: {
                Row: {
                    id: string
                    visitor_name: string
                    unit_id: string
                    entry_time: string
                    exit_time: string | null
                    purpose: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    visitor_name: string
                    unit_id: string
                    entry_time?: string
                    exit_time?: string | null
                    purpose?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    visitor_name?: string
                    unit_id?: string
                    entry_time?: string
                    exit_time?: string | null
                    purpose?: string | null
                    created_at?: string
                }
            }
            packages: {
                Row: {
                    id: string
                    recipient_unit_id: string
                    description: string
                    received_at: string
                    picked_up_at: string | null
                    status: 'pending' | 'picked-up'
                    created_at: string
                }
                Insert: {
                    id?: string
                    recipient_unit_id: string
                    description: string
                    received_at?: string
                    picked_up_at?: string | null
                    status?: 'pending' | 'picked-up'
                    created_at?: string
                }
                Update: {
                    id?: string
                    recipient_unit_id?: string
                    description?: string
                    received_at?: string
                    picked_up_at?: string | null
                    status?: 'pending' | 'picked-up'
                    created_at?: string
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}
