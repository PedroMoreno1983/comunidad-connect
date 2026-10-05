import type { PaymentCheckout } from '@/lib/types';

/** Redirige al checkout de la pasarela. Transbank exige POST con token_ws. */
export function redirectToPaymentCheckout(checkout: PaymentCheckout) {
    if (checkout.redirectMethod === 'POST' && checkout.tokenField) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = checkout.url;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = checkout.tokenField;
        input.value = checkout.token;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        return;
    }
    window.location.href = checkout.url;
}
