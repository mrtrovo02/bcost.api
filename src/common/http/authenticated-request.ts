export type BcostAuthenticatedUser = {
  id?: string;
  sub?: string;
  email?: string;
  name?: string;
  role?: string | null;
  companyId?: string | null;
  activeCompanyId?: string | null;
  companyIds?: string[] | null;
  rolesByCompany?: Record<string, string> | null;
};

export type AuthenticatedRequest = {
  user: BcostAuthenticatedUser;
  companyId?: string | null;
  traceId?: string;
};
