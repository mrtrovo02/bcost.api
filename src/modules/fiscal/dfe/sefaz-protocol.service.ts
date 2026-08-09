'use strict';

import { BadRequestException, Injectable } from '@nestjs/common';

export interface SefazProtocolParseResult {
  protocol: string;
  protocolLength: number;
  statusCode?: string;
  message?: string;
}

@Injectable()
export class SefazProtocolService {
  parseProtocol(value: unknown): SefazProtocolParseResult {
    const protocol = String(value ?? '').trim();

    if (!/^\d{15,17}$/.test(protocol)) {
      throw new BadRequestException(
        'Protocolo SEFAZ deve conter entre 15 e 17 dígitos numéricos.',
      );
    }

    return {
      protocol,
      protocolLength: protocol.length,
    };
  }

  parseAuthorizationReturn(payload: unknown): SefazProtocolParseResult {
    const root = this.asRecord(payload);
    const infProt = this.findInfProt(root);
    const protocol = infProt?.nProt ?? root?.nProt;
    const parsed = this.parseProtocol(protocol);

    return {
      ...parsed,
      statusCode: this.toString(infProt?.cStat ?? root?.cStat),
      message: this.toString(infProt?.xMotivo ?? root?.xMotivo),
    };
  }

  private findInfProt(
    root: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    const candidates = [
      root?.infProt,
      this.asRecord(root?.protNFe)?.infProt,
      this.asRecord(this.asRecord(root?.nfeProc)?.protNFe)?.infProt,
      this.asRecord(this.asRecord(root?.retConsReciNFe)?.protNFe)?.infProt,
    ];

    for (const candidate of candidates) {
      const record = this.asRecord(candidate);
      if (record) return record;
    }

    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return undefined;
  }

  private toString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return undefined;
  }
}
