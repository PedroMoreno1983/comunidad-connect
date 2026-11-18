import { CHAT_IMAGE_MAX_SIDE } from './chatAttachmentRules';

/**
 * Achica una imagen en el navegador antes de enviarla a CoCo (solo navegador).
 *
 * El cuerpo de /api/coco no puede pasar de 4,5 MB (Vercel): una foto de
 * celular de 4 MB, en base64, ya no cabía. Se lleva al lado mayor que el modelo
 * aprovecha y se vuelve a codificar como JPEG, bajando la calidad hasta que
 * entre en el presupuesto. Un GIF chico se envía tal cual.
 */

function readAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No pude leer la imagen.'));
        reader.onerror = () => reject(new Error('No pude leer la imagen.'));
        reader.readAsDataURL(file);
    });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new window.Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pude abrir la imagen.')); };
        image.src = url;
    });
}

export async function prepareChatImage(file: File, maxChars: number): Promise<string> {
    // Ya es liviana y en un formato que el modelo lee: se envía sin tocar.
    if (file.size * 1.37 + 64 <= maxChars && (file.type === 'image/gif' || file.size <= 350_000)) {
        const original = await readAsDataUrl(file);
        if (/^data:image\/(?:jpeg|png|gif|webp);base64,/.test(original) && original.length <= maxChars) return original;
    }
    const image = await loadImage(file);
    let side = CHAT_IMAGE_MAX_SIDE;
    for (let attempt = 0; attempt < 6; attempt++) {
        const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Tu navegador no pudo preparar la imagen.');
        // JPEG no tiene transparencia: fondo blanco para PNG y WebP con alfa.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        for (const quality of [0.86, 0.75, 0.62]) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= maxChars) return dataUrl;
        }
        side = Math.round(side * 0.75);
    }
    throw new Error(`${file.name} es demasiado pesada para enviarla. Prueba con una foto más chica.`);
}
