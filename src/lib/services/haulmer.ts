import { supabase } from '../supabase';

interface PaymentPayload {
    amount: number;
    description: string;
    reference: string; // ID interno nuestro (e.g., deudo ID o carrito ID)
    client: {
        email: string;
        name: string;
    };
    returnUrl: string; // URL a donde vuelve el usuario despues de pagar
}

/**
 * Servicio para integrar el Gateway de Pagos de Haulmer.
 * Documentación Base: Endpoint POST /v1/checkout/payment
 */
export const HaulmerService = {
    apiKey: process.env.HAULMER_API_KEY || '',
    apiUrl: 'https://pay.haulmer.com/v1/checkout/payment',

    /**
     * Crea un intento de pago (Payment Link) en Haulmer.
     * Retorna la URL a donde debemos redirigir al usuario para completar el pago.
     */
    async createPaymentLink(payload: PaymentPayload): Promise<{ token: string; url: string }> {
        if (!this.apiKey) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error("HAULMER_API_KEY no configurada en producción. Configúrala en Vercel.");
            }
            console.warn("⚠️ HAULMER_API_KEY no detectada. Usando MOCK_URL para desarrollo local.");
            return {
                token: "mock_token_123",
                url: `/mock-payment?ref=${payload.reference}&amount=${payload.amount}`
            };
        }

        const body = {
            amount: payload.amount,
            description: payload.description,
            currency: 'CLP',
            external_id: payload.reference, // ID para trackear en nuestro webhook
            client: {
                name: payload.client.name,
                email: payload.client.email
            },
            urls: {
                return_url: payload.returnUrl
            }
        };

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Haulmer API Error:", errorData);
                throw new Error(errorData.message || "Error al generar cobro en Haulmer");
            }

            const data = await response.json();

            // Haulmer retorna tipícamente el redireccionamiento (ej. data.token, data.payment_url)
            // Ajustar los campos exactos según la documentación V1 de Haulmer en producción real
            return {
                token: data.token || data.id,
                url: data.url || `https://pay.haulmer.com/checkout?token=${data.token}`
            };

        } catch (error) {
            console.error("HaulmerService.createPaymentLink() Failed:", error);
            throw error;
        }
    }
};
