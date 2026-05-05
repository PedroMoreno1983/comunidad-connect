import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PeriodType = 'today' | '7days' | '1month' | '3months' | '6months' | '12months';

interface FilterState {
  selectedBrandId: string | null;
  period: PeriodType;
  setSelectedBrand: (brandId: string | null) => void;
  setPeriod: (period: PeriodType) => void;
  getDateRange: () => { from: Date; to: Date };
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      selectedBrandId: null,
      period: '7days',

      setSelectedBrand: (brandId) => set({ selectedBrandId: brandId }),
      
      setPeriod: (period) => set({ period }),

      getDateRange: () => {
        const now = new Date();
        const to = now;
        let from = new Date();

        switch (get().period) {
          case 'today':
            from.setHours(0, 0, 0, 0);
            break;
          case '7days':
            from.setDate(now.getDate() - 7);
            break;
          case '1month':
            from.setMonth(now.getMonth() - 1);
            break;
          case '3months':
            from.setMonth(now.getMonth() - 3);
            break;
          case '6months':
            from.setMonth(now.getMonth() - 6);
            break;
          case '12months':
            from.setMonth(now.getMonth() - 12);
            break;
        }

        return { from, to };
      },
    }),
    {
      name: 'dashboard-filters',
    }
  )
);

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoy' },
  { value: '7days', label: 'Últimos 7 días' },
  { value: '1month', label: 'Último mes' },
  { value: '3months', label: 'Últimos 3 meses' },
  { value: '6months', label: 'Últimos 6 meses' },
  { value: '12months', label: 'Últimos 12 meses' },
] as const;