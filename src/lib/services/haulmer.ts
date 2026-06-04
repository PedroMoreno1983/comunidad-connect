interface PaymentPayload {
    amount: number;
    description: string;
    reference: string; // ID interno nuestro (e.g., deudo ID o carrito ID)
    client: {
        email: string;
        name: string;
    };
    returnUrl: string; // URL a donde vuelve el usuario después de pagar
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
        if (!this.apiKey || this.apiKey === 'hl_api_key_test_12345' || this.apiKey.startsWith('hl_api_key_test')) {
            console.log('[HaulmerService] Test API key detected, redirecting to mock checkout.');
            return {
                token: 'mock_' + Date.now(),
                url: `/mock-checkout?reference=${payload.reference}&amount=${payload.amount}&returnUrl=${encodeURIComponent(payload.returnUrl)}`
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
