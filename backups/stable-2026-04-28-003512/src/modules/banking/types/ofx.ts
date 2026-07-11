export type OfxTransaction = {
  TRNAMT?: string | number;
  FITID?: string;
  MEMO?: string;
  NAME?: string;
  DTPOSTED?: string;
  TRNTYPE?: string;
};

export type OfxStatement = {
  BANKTRANLIST?: { STMTTRN?: OfxTransaction | OfxTransaction[] };
  LEDGERBAL?: { BALAMT?: string | number };
};

export type OfxData = {
  OFX?: {
    BANKMSGSRSV1?: {
      STMTTRNRS?: {
        STMTRS?: OfxStatement;
      };
    };
  };
};

export function normalizeOfxTransactions(
  statement?: OfxStatement,
): OfxTransaction[] {
  const stmt = statement?.BANKTRANLIST?.STMTTRN;
  if (!stmt) return [];
  return Array.isArray(stmt) ? stmt : [stmt];
}

export function getLedgerBalance(
  statement?: OfxStatement,
): string | number | undefined {
  return statement?.LEDGERBAL?.BALAMT;
}
