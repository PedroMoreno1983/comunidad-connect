import { useQuery } from '@tanstack/react-query';
import { brandService } from '../services/brandService';
import { useFilterStore, PERIOD_OPTIONS } from '../store/useFilterStore';
import { Filter, Calendar, ChevronDown } from 'lucide-react';
import './DashboardFilters.css';

export default function DashboardFilters() {
  const { selectedBrandId, period, setSelectedBrand, setPeriod } = useFilterStore();

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: brandService.getAll,
  });

  return (
    <div className="dashboard-filters-inline">
      {/* Filtro de Marca */}
      <div className="filter-inline">
        <Filter size={14} className="filter-inline-icon" />
        <select
          className="filter-inline-select"
          value={selectedBrandId || 'all'}
          onChange={(e) => setSelectedBrand(e.target.value === 'all' ? null : e.target.value)}
        >
          <option value="all">Todas las marcas</option>
          {brands?.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="filter-inline-chevron" />
      </div>

      {/* Filtro de Período */}
      <div className="filter-inline">
        <Calendar size={14} className="filter-inline-icon" />
        <select
          className="filter-inline-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="filter-inline-chevron" />
      </div>
    </div>
  );
}