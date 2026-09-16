export enum CommercialPlan {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  EXPERTS = 'EXPERTS',
  MULTIBENEFITS = 'MULTIBENEFITS',
}

export enum EntitlementTier {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export type BcostPlanInput = CommercialPlan | EntitlementTier | string;

/**
 * Matriz de mapeamento: Comercial -> Entitlement Tier
 */
const COMMERCIAL_TO_ENTITLEMENT_MAP: Record<CommercialPlan, EntitlementTier> = {
  [CommercialPlan.BASIC]: EntitlementTier.FREE,
  [CommercialPlan.STANDARD]: EntitlementTier.PRO,
  [CommercialPlan.EXPERTS]: EntitlementTier.ENTERPRISE,
  [CommercialPlan.MULTIBENEFITS]: EntitlementTier.ENTERPRISE,
};

/**
 * Normaliza qualquer string/enum de plano para um EntitlementTier seguro da aplicação.
 * Implementa estratégia Fail-Closed: Entradas inválidas retornam EntitlementTier.FREE.
 */
export function normalizePlanToTier(
  inputPlan?: string | null,
): EntitlementTier {
  if (!inputPlan) {
    return EntitlementTier.FREE;
  }

  const normalizedInput = inputPlan.trim().toUpperCase();

  // 1. Verificação se já é um EntitlementTier válido
  if (
    Object.values(EntitlementTier).includes(normalizedInput as EntitlementTier)
  ) {
    return normalizedInput as EntitlementTier;
  }

  // 2. Mapeamento a partir do Plano Comercial
  if (normalizedInput in COMMERCIAL_TO_ENTITLEMENT_MAP) {
    return COMMERCIAL_TO_ENTITLEMENT_MAP[normalizedInput as CommercialPlan];
  }

  // 3. Aliases legados para compatibilidade
  switch (normalizedInput) {
    case 'STARTER':
    case 'COMMUNITY':
      return EntitlementTier.FREE;
    case 'BUSINESS':
    case 'PREMIUM':
      return EntitlementTier.PRO;
    case 'CORPORATE':
    case 'CUSTOM':
      return EntitlementTier.ENTERPRISE;
    default:
      return EntitlementTier.FREE;
  }
}

/**
 * Mapeamento reverso para exibição na UI quando necessário
 */
export function mapTierToDefaultCommercialPlan(
  tier: EntitlementTier,
): CommercialPlan {
  switch (tier) {
    case EntitlementTier.FREE:
      return CommercialPlan.BASIC;
    case EntitlementTier.PRO:
      return CommercialPlan.STANDARD;
    case EntitlementTier.ENTERPRISE:
      return CommercialPlan.EXPERTS;
    default:
      return CommercialPlan.BASIC;
  }
}
