#!/usr/bin/env python3
"""
Generador de imágenes profesionales para Shopify
Procesa imágenes de productos con fondo transparente y genera:
- Fondo blanco puro (estándar Shopify)
- Fondo degradado sutil
- Con sombra profesional
- Tamaños optimizados
"""

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import os
import sys

# Configuración para Shopify
SHOPIFY_SIZE = (2048, 2048)  # Tamaño recomendado por Shopify
SHOPIFY_SIZE_SMALL = (1080, 1080)  # Para cargas más rápidas
PADDING = 150  # Espacio alrededor del producto


def create_gradient_background(size, color1, color2, direction="vertical"):
    """Crea un fondo degradado"""
    width, height = size
    image = Image.new('RGB', size, color1)
    draw = ImageDraw.Draw(image)
    
    for i in range(height if direction == "vertical" else width):
        ratio = i / (height if direction == "vertical" else width)
        r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
        g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
        b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
        
        if direction == "vertical":
            draw.line([(0, i), (width, i)], fill=(r, g, b))
        else:
            draw.line([(i, 0), (i, height)], fill=(r, g, b))
    
    return image


def add_drop_shadow(image, offset=(20, 20), background_color=(255, 255, 255), 
                    shadow_color=(0, 0, 0, 80), blur_radius=30):
    """Añade sombra suave al producto"""
    # Separar el canal alpha
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    
    # Crear máscara de sombra
    alpha = image.split()[-1]
    shadow = Image.new('RGBA', image.size, shadow_color)
    shadow.putalpha(alpha)
    
    # Aplicar blur
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
    
    # Crear imagen de fondo
    total_width = image.width + abs(offset[0]) + blur_radius * 2
    total_height = image.height + abs(offset[1]) + blur_radius * 2
    result = Image.new('RGBA', (total_width, total_height), background_color + (255,))
    
    # Pegar sombra
    shadow_position = (blur_radius + max(0, offset[0]), blur_radius + max(0, offset[1]))
    result.paste(shadow, shadow_position, shadow)
    
    # Pegar imagen original
    image_position = (blur_radius + max(0, -offset[0]), blur_radius + max(0, -offset[1]))
    result.paste(image, image_position, image)
    
    return result


def process_product_image(input_path, output_dir):
    """Procesa una imagen de producto y genera variantes profesionales"""
    
    filename = os.path.basename(input_path)
    name, ext = os.path.splitext(filename)
    
    # Cargar imagen
    try:
        img = Image.open(input_path)
    except Exception as e:
        print(f"Error cargando {input_path}: {e}")
        return
    
    # Convertir a RGBA si es necesario
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Obtener bounding box del contenido (quitar espacio transparente)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    
    # Calcular tamaño manteniendo proporción
    max_size = SHOPIFY_SIZE[0] - (PADDING * 2)
    ratio = min(max_size / img.width, max_size / img.height)
    new_size = (int(img.width * ratio), int(img.height * ratio))
    img_resized = img.resize(new_size, Image.Resampling.LANCZOS)
    
    print(f"Procesando: {filename}")
    print(f"  Tamaño original: {img.size}")
    print(f"  Tamaño redimensionado: {new_size}")
    
    # ========== VARIANTE 1: Fondo Blanco Puro ==========
    white_bg = Image.new('RGBA', SHOPIFY_SIZE, (255, 255, 255, 255))
    position = ((SHOPIFY_SIZE[0] - new_size[0]) // 2, 
                (SHOPIFY_SIZE[1] - new_size[1]) // 2)
    white_bg.paste(img_resized, position, img_resized)
    white_bg.convert('RGB').save(
        os.path.join(output_dir, f"{name}_white.jpg"), 
        'JPEG', 
        quality=95
    )
    print(f"  ✓ Generado: {name}_white.jpg")
    
    # ========== VARIANTE 2: Fondo Gris Claro ==========
    gray_bg = Image.new('RGBA', SHOPIFY_SIZE, (248, 248, 248, 255))
    gray_bg.paste(img_resized, position, img_resized)
    gray_bg.convert('RGB').save(
        os.path.join(output_dir, f"{name}_gray.jpg"), 
        'JPEG', 
        quality=95
    )
    print(f"  ✓ Generado: {name}_gray.jpg")
    
    # ========== VARIANTE 3: Degradado Sutil ==========
    gradient_bg = create_gradient_background(
        SHOPIFY_SIZE, 
        (245, 247, 250),  # Gris muy claro
        (240, 242, 245),  # Gris ligeramente más oscuro
        "vertical"
    ).convert('RGBA')
    gradient_bg.paste(img_resized, position, img_resized)
    gradient_bg.convert('RGB').save(
        os.path.join(output_dir, f"{name}_gradient.jpg"), 
        'JPEG', 
        quality=95
    )
    print(f"  ✓ Generado: {name}_gradient.jpg")
    
    # ========== VARIANTE 4: Con Sombra Profesional ==========
    shadow_img = add_drop_shadow(
        img_resized, 
        offset=(15, 25), 
        shadow_color=(0, 0, 0, 60),
        blur_radius=40
    )
    # Centrar en canvas
    canvas = Image.new('RGBA', SHOPIFY_SIZE, (255, 255, 255, 255))
    shadow_pos = ((SHOPIFY_SIZE[0] - shadow_img.width) // 2,
                  (SHOPIFY_SIZE[1] - shadow_img.height) // 2)
    canvas.paste(shadow_img, shadow_pos)
    canvas.convert('RGB').save(
        os.path.join(output_dir, f"{name}_shadow.jpg"), 
        'JPEG', 
        quality=95
    )
    print(f"  ✓ Generado: {name}_shadow.jpg")
    
    # ========== VARIANTE 5: Tamaño Pequeño (1080x1080) ==========
    small_canvas = Image.new('RGBA', SHOPIFY_SIZE_SMALL, (255, 255, 255, 255))
    small_max = SHOPIFY_SIZE_SMALL[0] - 100
    small_ratio = min(small_max / img.width, small_max / img.height)
    small_size = (int(img.width * small_ratio), int(img.height * small_ratio))
    img_small = img.resize(small_size, Image.Resampling.LANCZOS)
    small_pos = ((SHOPIFY_SIZE_SMALL[0] - small_size[0]) // 2,
                 (SHOPIFY_SIZE_SMALL[1] - small_size[1]) // 2)
    small_canvas.paste(img_small, small_pos, img_small)
    small_canvas.convert('RGB').save(
        os.path.join(output_dir, f"{name}_1080.jpg"), 
        'JPEG', 
        quality=90
    )
    print(f"  ✓ Generado: {name}_1080.jpg")
    
    # ========== VARIANTE 6: PNG con Transparencia ==========
    transparent_canvas = Image.new('RGBA', SHOPIFY_SIZE, (255, 255, 255, 0))
    transparent_canvas.paste(img_resized, position, img_resized)
    transparent_canvas.save(
        os.path.join(output_dir, f"{name}_transparent.png"), 
        'PNG'
    )
    print(f"  ✓ Generado: {name}_transparent.png")
    
    print()


def main():
    input_dir = "product_images"
    output_dir = "product_images/output"
    
    # Crear directorio de salida
    os.makedirs(output_dir, exist_ok=True)
    
    # Buscar imágenes
    valid_extensions = ('.png', '.jpg', '.jpeg', '.webp')
    images = [f for f in os.listdir(input_dir) 
              if f.lower().endswith(valid_extensions) and os.path.isfile(os.path.join(input_dir, f))]
    
    if not images:
        print(f"No se encontraron imágenes en '{input_dir}'")
        print("Por favor, coloca tus imágenes de productos en esa carpeta.")
        print("Formatos soportados: PNG, JPG, JPEG, WEBP")
        return
    
    print(f"=" * 60)
    print(f"GENERADOR DE IMÁGENES PARA SHOPIFY")
    print(f"=" * 60)
    print(f"Imágenes encontradas: {len(images)}")
    print(f"Directorio de salida: {output_dir}")
    print()
    
    for image_name in images:
        input_path = os.path.join(input_dir, image_name)
        process_product_image(input_path, output_dir)
    
    print("=" * 60)
    print("¡PROCESO COMPLETADO!")
    print("=" * 60)
    print(f"Las imágenes generadas están en: {output_dir}")
    print()
    print("Variantes generadas por producto:")
    print("  • _white.jpg      - Fondo blanco puro (recomendado para Shopify)")
    print("  • _gray.jpg       - Fondo gris claro")
    print("  • _gradient.jpg   - Degradado sutil")
    print("  • _shadow.jpg     - Con sombra profesional")
    print("  • _1080.jpg       - Tamaño reducido 1080x1080")
    print("  • _transparent.png - Con transparencia (PNG)")


if __name__ == "__main__":
    main()
