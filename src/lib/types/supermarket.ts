import type { CommunityGovernanceStatus } from './users';

export interface CollectivePurchaseCampaign {
  id: string;
  communityId?: string;
  title: string;
  supplier: string;
  category: 'water' | 'gas' | 'cleaning' | 'food' | 'eco' | 'other';
  unitPrice: number;
  retailPrice: number;
  minimumParticipants: number;
  participants: number;
  deadline: string;
  status: 'open' | 'ready' | 'ordered';
  organizer: string;
  organizerId?: string;
  governanceStatus: CommunityGovernanceStatus;
  coordinatorId?: string;
  coordinatorName?: string;
  governanceNote?: string;
  createdAt: string;
}

export type SupermarketStore =
  | 'Jumbo'
  | 'Santa Isabel'
  | 'Lider'
  | 'Unimarc'
  | 'Tottus'
  | 'aCuenta'
  | 'Irurzun';

export type SupermarketChannelType = 'retail' | 'wholesale';

export type SupermarketGroupOrderStatus = 'open' | 'ready' | 'locked' | 'completed' | 'cancelled';

export interface SupermarketGroupOrderItem {
  id: string;
  orderId: string;
  userId: string;
  memberName: string;
  requestedTerm: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupermarketGroupOrderMember {
  userId: string;
  name: string;
  joinedAt: string;
  /** Cuando el organizador dio por recibido su pago. null = pendiente. */
  paidAt: string | null;
}

export interface SupermarketGroupSettlement {
  userId: string;
  memberName: string;
  amount: number;
  payeeUserId: string;
  payeeName: string;
  isOrganizer: boolean;
  paidAt: string | null;
}

export interface SupermarketGroupOrder {
  id: string;
  communityId: string;
  createdBy: string;
  title: string;
  status: SupermarketGroupOrderStatus;
  closesAt: string;
  selectedStore?: SupermarketStore | null;
  selectedTotal?: number | null;
  selectedChannelType?: SupermarketChannelType | null;
  retailerUrl?: string | null;
  selectedItems: SupermarketGroupComparisonItem[];
  /** Lo que realmente se pagó en el supermercado (boleta). Desde aquí se reparte. */
  finalTotal?: number | null;
  purchasedAt?: string | null;
  members: SupermarketGroupOrderMember[];
  items: SupermarketGroupOrderItem[];
  settlements: SupermarketGroupSettlement[];
  canManage: boolean;
  governanceStatus: CommunityGovernanceStatus;
  coordinatorId?: string | null;
  coordinatorName?: string | null;
  governanceNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupermarketGroupCreateInput {
  title: string;
  closesAt: string;
  shoppingList: string;
  requestId: string;
}

export type SupermarketMeasurementUnit = 'kg' | 'g' | 'l' | 'ml';

export interface SupermarketGroupComparisonItem {
  requestedTerm: string;
  requestedQuantity: number;
  requestedUnit?: SupermarketMeasurementUnit;
  name: string;
  store: SupermarketStore;
  price: number;
  quantity: number;
  packUnits: number;
  suppliedQuantity: number;
  lineTotal: number;
  productUrl?: string;
  /** Mismos identificadores que la compra individual: sin sku no se carga el carro por API. */
  id?: string;
  sku?: string;
  offerId?: string;
  salesUnit?: string;
  imageUrl?: string;
}

export interface SupermarketGroupComparison {
  orderId: string;
  store: SupermarketStore;
  channelType: SupermarketChannelType;
  subtotal: number;
  complete: boolean;
  missingTerms: string[];
  items: SupermarketGroupComparisonItem[];
  retailerUrl: string;
}

/**
 * Promoción por volumen ("4 x $990", "Combina 4 x $5.990"): `totalPrice` pesos
 * por cada bloque de `minQuantity` unidades. Issue #96.
 */
export interface SupermarketVolumePromo {
  minQuantity: number;
  totalPrice: number;
  label?: string;
  /** Productos con la misma clave se suman para completar el bloque ("Combina"). */
  group?: string;
}

/**
 * `promo_aware`: todos los productos de la canasta tienen la promoción por
 * volumen revisada por el scraper. `unit_price`: al menos uno no, así que el
 * total es un estimado sobre precio unitario.
 */
export type SupermarketPricingBasis = 'promo_aware' | 'unit_price';

/** Reglas de compra por tienda que el catálogo no trae. */
export interface SupermarketStorePolicy {
  store: string;
  minimumOrder?: number;
}

export interface SupermarketSearchCandidate {
  id: string;
  name: string;
  brand?: string;
  /** Codigo de la tienda. Sin el no se puede cargar el carro por API. */
  sku?: string;
  /**
   * Lider/Walmart: identificador de oferta que exige el enlace oficial de la app.
   * Es distinto del sku y solo existe para esa cadena.
   */
  offerId?: string;
  /** Unidad de venta que Lider interpreta al procesar el enlace oficial. */
  salesUnit?: string;
  requestedTerm: string;
  requestedQuantity: number;
  requestedUnit?: SupermarketMeasurementUnit;
  quantity: number;
  packUnits: number;
  suppliedQuantity: number;
  price: number;
  lineTotal: number;
  store?: string;
  productUrl?: string;
  /** Fotografia publicada por la tienda para este producto exacto. */
  imageUrl?: string;
  originalPrice?: number;
  isOffer?: boolean;
  /** Por qué CoCo eligió esta marca/presentación (visible para el usuario). */
  selectionReason?: string;
  fetchedAt?: string;
  /** Promoción por volumen vigente para este producto, si la tienda la publica. */
  volumePromo?: SupermarketVolumePromo;
  /** El scraper revisó el badge de promoción en su última pasada. */
  promoChecked?: boolean;
  /** Ahorro de la promoción por volumen ya descontado en `lineTotal`. */
  promoSavings?: number;
}

  export interface SupermarketCatalogProduct {
    id: string;
    store: string;
    name: string;
    brand: string;
    sku?: string;
    offerId?: string;
    salesUnit?: string;
    price: number;
    imageUrl?: string;
    productUrl?: string;
    fetchedAt?: string;
  }

  export interface SupermarketCatalogResponse {
    products: SupermarketCatalogProduct[];
    hasMore: boolean;
    error?: string;
  }

  export interface SupermarketSelectedProduct extends SupermarketCatalogProduct {
    requestedTerm: string;
    quantity: number;
  }

export interface SupermarketListResolution {
  term: string;
  quantity: number;
  product?: SupermarketCatalogProduct;
}

export interface SavedShoppingList {
  id: string;
  title: string;
  body: string;
  store: string | null;
  updatedAt: string;
}

export interface SupermarketShoppingItem extends SupermarketSearchCandidate {
  checked: boolean;
  available: boolean;
  source: 'catalog' | 'live' | 'missing' | 'manual';
}

export interface SupermarketBasketSummary {
  store: string;
  subtotal: number;
  coveredCount: number;
  requestedCount: number;
  coveragePercent: number;
  missingTerms: string[];
  complete: boolean;
}

export interface SupermarketBasketCandidate extends SupermarketBasketSummary {
  channelType: SupermarketChannelType;
  items: SupermarketSearchCandidate[];
  fetchedAt?: string;
  /** Si el subtotal incluye promociones por volumen o es estimado sobre precio unitario. */
  pricingBasis?: SupermarketPricingBasis;
  /** Ahorro total por promociones por volumen incluido en `subtotal`. */
  promoSavings?: number;
  /** Pedido mínimo conocido de la tienda. */
  minimumOrder?: number;
  /** La canasta no alcanza el pedido mínimo: la tienda no deja cursarla. */
  belowMinimum?: boolean;
  /** Cuánto falta para el pedido mínimo. */
  shortfall?: number;
}

export type SupermarketComparisonSourceStatus = 'ok' | 'no_results' | 'degraded';

export interface SupermarketComparisonSource {
  store: string;
  status: SupermarketComparisonSourceStatus;
}

export type SupermarketPurchasePlanStatus = 'single_store' | 'split_store' | 'needs_substitution';

export interface SupermarketPurchasePlanBasket {
  store: string;
  channelType: SupermarketChannelType;
  subtotal: number;
  items: SupermarketSearchCandidate[];
}

export interface SupermarketSubstitutionTask {
  requestedTerm: string;
  suggestedStore?: string;
  searchUrl?: string;
  reason: string;
}

export interface SupermarketPurchasePlan {
  status: SupermarketPurchasePlanStatus;
  complete: boolean;
  total: number;
  requestedCount: number;
  resolvedCount: number;
  storeCount: number;
  baskets: SupermarketPurchasePlanBasket[];
  unresolvedTerms: string[];
  substitutionTasks: SupermarketSubstitutionTask[];
}

export interface SupermarketRequestedItem {
  term: string;
  quantity: number;
  unit?: SupermarketMeasurementUnit;
}

export interface SupermarketSearchResponse {
  error?: string;
  message: string;
  items: SupermarketShoppingItem[];
  fetchedAt?: string;
  mode?: string;
  recommendedStore?: string | null;
  basketSubtotal?: number;
  basketReady: boolean;
  requestedCount: number;
  foundCount: number;
  missingTerms: string[];
  alternativesByTerm?: Record<string, SupermarketSearchCandidate[]>;
  requestedItems?: SupermarketRequestedItem[];
  basketComparison?: SupermarketBasketSummary[];
  basketOptions?: SupermarketBasketCandidate[];
  sources?: SupermarketComparisonSource[];
  degradedStores?: string[];
}

export interface SupermarketCartButtonProps {
  store: string;
  items: SupermarketSearchCandidate[];
  complete?: boolean;
}

export interface SupermarketProductThumbnailProps {
  imageUrl?: string;
  alt: string;
  size?: 'compact' | 'card';
  tone?: 'light' | 'dark';
  pending?: boolean;
}

export interface SupermarketCartHandoffItem {
  id: string;
  name: string;
  requestedTerm: string;
  quantity: number;
  sku?: string;
  offerId?: string;
  salesUnit?: string;
  productUrl?: string;
  /**
   * Precio unitario con el que se cotizo la canasta. Sirve para no sustituir en
   * silencio por otro producto cuando el sku exacto no esta disponible.
   */
  price?: number;
}

export interface SupermarketCartHandoff {
  supported: boolean;
  store: string;
  mode: 'remote_browser' | 'direct_url' | 'unavailable';
  cartUrl?: string;
  sessionUrl?: string;
  sessionId?: string;
  expiresAt?: string;
  plannedCount: number;
  missingItems: string[];
  reason?: string;
}

export interface SupermarketSimulationItem {
    sku: string;
    quantity: number;
    seller?: string;
}

export interface SupermarketSimulationResult {
    supported: boolean;
    complete?: boolean;
    total?: number;
    discount?: number;
    resolvedItems?: number;
    reason?: string;
    error?: string;
    /**
     * Monto minimo de pedido que la tienda declara, en pesos.
     *
     * `undefined` significa desconocido, no ausencia de minimo, y la diferencia
     * importa: la consulta se hace sin direccion de despacho, y el minimo puede
     * aparecer o cambiar al elegir comuna o metodo de entrega. aCuenta avisa
     * "Te faltan $16.895 para completar el pedido minimo" en su propio carro, y
     * ninguna API disponible lo anticipa.
     */
    minimumOrder?: number;
    /** Si el minimo se consulto sin direccion, y por lo tanto puede cambiar. */
    minimumOrderWithoutAddress?: boolean;
}

export interface SupermarketHistoryResponse {
    enabled?: boolean;
    recorded?: number;
    error?: string;
    suggestions?: Array<{ term: string; daysSinceLast: number }>;
}

export interface SupermarketSealsResponse {
    supported?: boolean;
    seals?: Record<string, string[]>;
    error?: string;
}

/** Una alternativa concreta con menos sellos informados que el producto elegido. */
export interface SupermarketSealAlternativeOption {
    sku: string;
    name: string;
    price: number;
    seals: string[];
    /** Diferencia contra el producto actual. Positivo = cuesta mas. */
    priceDelta: number;
}

/**
 * Alternativas para un producto de la canasta. `seals: null` en `current`
 * significa que no se pudieron consultar, no que el producto no tenga: sin ese
 * dato no hay contra que comparar y `options` viene vacio.
 */
export interface SupermarketSealAlternative {
    requestedTerm: string;
    current: { sku: string; name: string; price: number; seals: string[] | null };
    options: SupermarketSealAlternativeOption[];
    unknownCurrent: boolean;
}

export interface SupermarketAlternativesResponse {
    supported?: boolean;
    alternatives?: SupermarketSealAlternative[];
    error?: string;
}

// ─── Lista de compras: autocompletado y corrección ──────────────────────────

export interface ShoppingTermSuggestion {
    term: string;
    /** Cuántos productos del catálogo responden a este término. */
    products: number;
}

/**
 * `unverified` no es `unknown`: el primero significa que no se pudo consultar el
 * vocabulario, el segundo que sí se consultó y el término no aparece. Marcar lo
 * no verificado como error haría que la pantalla le achacara a la persona un
 * problema que es nuestro.
 */
export interface ShoppingTermReview {
    term: string;
    status: 'ok' | 'unknown' | 'unverified';
    suggestions: ShoppingTermSuggestion[];
}

export interface ShoppingSuggestionsResponse {
    error?: string;
    suggestions?: ShoppingTermSuggestion[];
}

export interface ShoppingReviewResponse {
    error?: string;
    items?: ShoppingTermReview[];
}
