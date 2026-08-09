'use strict';

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

/**
 * Interface normalizada para o Schema 2026.
 * Nomes de campos sincronizados com as colunas do banco de dados (Prisma).
 */
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getPath = (value: unknown, path: Array<string | number>): unknown => {
  let current: unknown = value;
  for (const part of path) {
    if (typeof part === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[part];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
};

const firstRecord = (value: unknown): UnknownRecord | undefined => {
  if (isRecord(value)) return value;
  if (Array.isArray(value)) {
    const first: unknown = (value as unknown[])[0];
    return isRecord(first) ? first : undefined;
  }
  return undefined;
};

const toStringSafe = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
};

const toFixedCode = (value: unknown, length: number): string | undefined => {
  const normalized = toStringSafe(value);
  if (!normalized) return undefined;
  return normalized.padStart(length, '0').slice(-length);
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const toDateSafe = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
};

const firstPathRecord = (
  root: UnknownRecord,
  paths: Array<Array<string | number>>,
): UnknownRecord | undefined => {
  for (const path of paths) {
    const found = firstRecord(getPath(root, path));
    if (found) return found;
  }
  return undefined;
};

export interface NormalizedInvoiceData {
  number: string;
  accessKey: string;
  issuedAt: Date; // Corrigido: era issueDate
  amount: number; // Corrigido: era totalValue
  taxableValue: number;
  type: 'PRODUCT' | 'SERVICE';
  finNFe?: string;
  issuePurpose?:
    | 'NORMAL'
    | 'COMPLEMENTARY'
    | 'ADJUSTMENT'
    | 'RETURN'
    | 'DEBIT_NOTE'
    | 'CREDIT_NOTE';
  cstCode?: string;
  cClassTribCode?: string;
  destinationStateIbge?: string;
  destinationMunicipalityIbge?: string;
  hasLegacyTaxes?: boolean;
  taxReformPayload?: {
    group: 'UB';
    cbsValue: number;
    ibsValue: number;
    selectiveTaxValue: number;
    raw: unknown;
  };
  customerDocument: string;
  customerName: string;
  retentions: {
    iss: number;
    irrf: number;
    pis: number;
    cofins: number;
    csll: number;
  };
  rawJson: unknown;
}

const FIN_NFE_PURPOSE_MAP: Record<
  string,
  NormalizedInvoiceData['issuePurpose']
> = {
  '1': 'NORMAL',
  '2': 'COMPLEMENTARY',
  '3': 'ADJUSTMENT',
  '4': 'RETURN',
  '5': 'DEBIT_NOTE',
  '6': 'CREDIT_NOTE',
};

@Injectable()
export class XmlService {
  private readonly logger = new Logger(XmlService.name);
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      trimValues: true,
      isArray: (name) =>
        ['InfNfse', 'CompNfse', 'det', 'imposto', 'Nfse'].includes(name),
    });
  }

  parseInvoiceXml(xmlInput: Buffer | string): NormalizedInvoiceData {
    try {
      const xmlString =
        typeof xmlInput === 'string' ? xmlInput : xmlInput.toString('utf-8');

      if (!xmlString || xmlString.trim().length === 0) {
        throw new Error('Conteúdo do XML está vazio.');
      }

      const jsonObj = this.parser.parse(xmlString) as unknown;
      const root = isRecord(jsonObj) ? jsonObj : undefined;
      if (!root) {
        throw new Error('Estrutura XML inválida.');
      }

      const nfe = firstRecord(
        getPath(root, ['nfeProc', 'NFe', 'infNFe']) ??
          getPath(root, ['NFe', 'infNFe']),
      );
      if (nfe) {
        return this.extractNFeData(nfe, root);
      }

      const nfseBase = firstPathRecord(root, [
        ['CompNfse', 0, 'Nfse', 'InfNfse'],
        ['Nfse', 'InfNfse'],
        ['Nfse', 0, 'InfNfse'],
        [
          'ConsultarLoteRpsResposta',
          'ListaNfse',
          'CompNfse',
          'Nfse',
          'InfNfse',
        ],
        ['EnviarLoteRpsResposta', 'ListaNfse', 'CompNfse', 'Nfse', 'InfNfse'],
      ]);

      if (nfseBase) {
        return this.extractNFSeData(nfseBase, root);
      }

      throw new Error('Estrutura fiscal não reconhecida.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Parser Error] ${message}`);
      throw new BadRequestException(`Erro na interpretação do XML: ${message}`);
    }
  }

  private extractNFeData(
    info: UnknownRecord,
    raw: UnknownRecord,
  ): NormalizedInvoiceData {
    const total = isRecord(info.total) ? info.total : undefined;
    const totais = total && isRecord(total.ICMSTot) ? total.ICMSTot : undefined;
    const retencoes =
      total && isRecord(total.retTrib) ? total.retTrib : undefined;
    const dest = isRecord(info.dest) ? info.dest : undefined;
    const ide = isRecord(info.ide) ? info.ide : undefined;
    const firstDet = firstRecord(info.det);
    const firstImposto = firstDet ? firstRecord(firstDet.imposto) : undefined;
    const groupUB =
      firstRecord(getPath(firstImposto, ['IBSCBS'])) ??
      firstRecord(getPath(firstImposto, ['gIBSCBS'])) ??
      firstRecord(getPath(firstImposto, ['UB']));
    const firstCbs = groupUB && firstRecord(groupUB.gCBS);
    const firstIbs = groupUB && firstRecord(groupUB.gIBS);
    const firstIs = groupUB && firstRecord(groupUB.gIS);
    const finNFe = toStringSafe(ide?.finNFe);

    const accessKeyRaw = toStringSafe(info['@_Id']);
    const accessKey =
      (accessKeyRaw ? accessKeyRaw.replace('NFe', '') : undefined) ??
      toStringSafe(getPath(info, ['protNFe', 'infProt', 'chNFe'])) ??
      `NFE-${Date.now()}`;

    return {
      number: toStringSafe(ide?.nNF) ?? '0',
      accessKey,
      issuedAt: toDateSafe(ide?.dhEmi ?? ide?.dEmi, new Date()),
      amount: toNumberSafe(totais?.vNF, 0),
      taxableValue: toNumberSafe(totais?.vBC ?? totais?.vNF, 0),
      type: 'PRODUCT',
      finNFe,
      issuePurpose: finNFe ? FIN_NFE_PURPOSE_MAP[finNFe] : undefined,
      cstCode:
        toFixedCode(getPath(groupUB, ['CST']), 3) ??
        toFixedCode(getPath(firstCbs, ['CST']), 3) ??
        toFixedCode(getPath(firstIbs, ['CST']), 3),
      cClassTribCode:
        toFixedCode(getPath(groupUB, ['cClassTrib']), 6) ??
        toFixedCode(getPath(firstCbs, ['cClassTrib']), 6) ??
        toFixedCode(getPath(firstIbs, ['cClassTrib']), 6),
      destinationStateIbge:
        toStringSafe(dest?.cUF) ??
        toStringSafe(getPath(dest, ['enderDest', 'UF'])),
      destinationMunicipalityIbge: toFixedCode(
        getPath(dest, ['enderDest', 'cMun']),
        7,
      ),
      hasLegacyTaxes: Boolean(
        firstImposto?.ICMS ||
        firstImposto?.PIS ||
        firstImposto?.COFINS ||
        firstImposto?.IPI,
      ),
      taxReformPayload: groupUB
        ? {
            group: 'UB',
            cbsValue: toNumberSafe(firstCbs?.vCBS ?? groupUB.vCBS, 0),
            ibsValue: toNumberSafe(firstIbs?.vIBS ?? groupUB.vIBS, 0),
            selectiveTaxValue: toNumberSafe(firstIs?.vIS ?? groupUB.vIS, 0),
            raw: groupUB,
          }
        : undefined,
      customerDocument: toStringSafe(dest?.CNPJ ?? dest?.CPF) ?? '00000000000',
      customerName: toStringSafe(dest?.xNome) ?? 'Cliente Consumidor',
      retentions: {
        iss: 0,
        irrf: toNumberSafe(retencoes?.vIRRF, 0),
        pis: toNumberSafe(retencoes?.vPIS, 0),
        cofins: toNumberSafe(retencoes?.vCOFINS, 0),
        csll: toNumberSafe(retencoes?.vCSLL, 0),
      },
      rawJson: raw,
    };
  }

  private extractNFSeData(
    nfse: UnknownRecord,
    raw: UnknownRecord,
  ): NormalizedInvoiceData {
    const servico = isRecord(nfse.Servico) ? nfse.Servico : undefined;
    const valores = isRecord(servico?.Valores)
      ? servico?.Valores
      : isRecord(nfse.Valores)
        ? nfse.Valores
        : undefined;
    const tomador = isRecord(nfse.TomadorServico)
      ? nfse.TomadorServico
      : isRecord(nfse.Tomador)
        ? nfse.Tomador
        : undefined;
    const tomadorIdent = isRecord(tomador?.IdentificacaoTomador)
      ? tomador?.IdentificacaoTomador
      : undefined;

    const prestadorCnpj =
      toStringSafe(
        getPath(nfse, ['PrestadorServico', 'IdentificacaoPrestador', 'Cnpj']),
      ) ??
      toStringSafe(getPath(nfse, ['PrestadorServico', 'Cnpj'])) ??
      '00000000000000';

    return {
      number: toStringSafe(nfse.Numero) ?? '0',
      accessKey:
        toStringSafe(nfse.CodigoVerificacao) ??
        `NFSE-${toStringSafe(nfse.Numero) ?? '0'}-${prestadorCnpj}`,
      issuedAt: toDateSafe(nfse.DataEmissao ?? nfse.DataGeracao, new Date()),
      amount: toNumberSafe(valores?.ValorServicos, 0),
      taxableValue: toNumberSafe(
        valores?.BaseCalculo ?? valores?.ValorServicos,
        0,
      ),
      type: 'SERVICE',
      customerDocument:
        toStringSafe(getPath(tomadorIdent, ['CpfCnpj', 'Cnpj'])) ??
        toStringSafe(getPath(tomadorIdent, ['CpfCnpj', 'Cpf'])) ??
        toStringSafe(tomador?.Cnpj ?? tomador?.Cpf) ??
        '00000000000',
      customerName:
        toStringSafe(tomador?.RazaoSocial ?? tomador?.Nome) ??
        'Tomador Desconhecido',
      retentions: {
        iss: toNumberSafe(valores?.ValorIssRetido ?? valores?.IssRetido, 0),
        irrf: toNumberSafe(
          valores?.ValorIr ?? valores?.IrRetido ?? valores?.ValorIrrf,
          0,
        ),
        pis: toNumberSafe(valores?.ValorPis ?? valores?.PisRetido, 0),
        cofins: toNumberSafe(valores?.ValorCofins ?? valores?.CofinsRetido, 0),
        csll: toNumberSafe(valores?.ValorCsll ?? valores?.CsllRetido, 0),
      },
      rawJson: raw,
    };
  }
}
