"use client";

import { useEffect, useState } from 'react';
import { ProductCapabilitiesService } from '@/lib/api';
import type { ProductCapabilities } from '@/lib/types';

export const HIDDEN_PRODUCT_CAPABILITIES: ProductCapabilities = {
  onlinePayments: false,
  marketingReels: false,
  iotAutomation: false,
  externalMonitoring: false,
  supermarketOrdering: false,
};

export function useProductCapabilities(): ProductCapabilities {
  const [capabilities, setCapabilities] = useState<ProductCapabilities>(HIDDEN_PRODUCT_CAPABILITIES);

  useEffect(() => {
    let active = true;

    ProductCapabilitiesService.getCapabilities()
      .then(result => {
        if (active) setCapabilities(result);
      })
      .catch(() => {
        if (active) setCapabilities(HIDDEN_PRODUCT_CAPABILITIES);
      });

    return () => {
      active = false;
    };
  }, []);

  return capabilities;
}
