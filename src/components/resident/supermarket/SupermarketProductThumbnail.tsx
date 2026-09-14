'use client';

import Image from 'next/image';
import { ImageOff, ShoppingBasket } from 'lucide-react';
import { useState } from 'react';
import {
  safeSupermarketProductImage,
  shouldOptimizeSupermarketProductImage,
} from '@/lib/supermarketProductImage';
import type { SupermarketProductThumbnailProps } from '@/lib/types';

export function SupermarketProductThumbnail({
  imageUrl,
  alt,
  size = 'card',
  tone = 'light',
  pending = false,
}: SupermarketProductThumbnailProps) {
  const safeImage = safeSupermarketProductImage(imageUrl);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const failed = safeImage !== null && failedImage === safeImage;
  const optimize = safeImage !== null && shouldOptimizeSupermarketProductImage(safeImage);
  const compact = size === 'compact';
  const dark = tone === 'dark';

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl ${compact ? 'h-14 w-14' : 'h-24 w-24'}`}
      style={{
        background: dark ? 'rgba(255,255,255,0.10)' : 'var(--cc-paper-warm)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'var(--cc-line)'}`,
      }}
    >
      {safeImage && !failed && optimize ? (
        <Image
          src={safeImage}
          alt={alt}
          fill
          sizes={compact ? '56px' : '96px'}
          className="object-contain p-1.5"
          loading="lazy"
          onError={() => setFailedImage(safeImage)}
        />
      ) : safeImage && !failed ? (
        // Las URLs legacy de Lider son transformadores con query dinamica. Se
        // cargan directo para no abrir esas queries en el proxy de Next.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImage}
          alt={alt}
          className="h-full w-full object-contain p-1.5"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(safeImage)}
        />
      ) : (
        <div className={`flex h-full flex-col items-center justify-center gap-1 ${dark ? 'text-white/45' : 'cc-text-tertiary'}`}>
          {failed ? (
            <ImageOff className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
          ) : (
            <ShoppingBasket className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
          )}
          <span className={`${compact ? 'sr-only' : 'text-[9px]'} font-bold uppercase tracking-[0.08em]`}>
            {pending ? 'Por comparar' : 'Sin foto'}
          </span>
        </div>
      )}
    </div>
  );
}
