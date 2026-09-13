import { BadRequestException } from '@nestjs/common';
import { SefazProtocolService } from './sefaz-protocol.service.js';

describe('SefazProtocolService', () => {
  let service: SefazProtocolService;

  beforeEach(() => {
    service = new SefazProtocolService();
  });

  it.each(['123456789012345', '1234567890123456', '12345678901234567'])(
    'aceita protocolo SEFAZ com %s',
    (protocol) => {
      expect(service.parseProtocol(protocol)).toEqual({
        protocol,
        protocolLength: protocol.length,
      });
    },
  );

  it('recusa protocolo fora da faixa de 15 a 17 dígitos', () => {
    expect(() => service.parseProtocol('123')).toThrow(BadRequestException);
    expect(() => service.parseProtocol('123456789012345678')).toThrow(
      BadRequestException,
    );
    expect(() => service.parseProtocol('12345678901234A')).toThrow(
      BadRequestException,
    );
  });

  it('normaliza retorno de autorização SEFAZ aninhado', () => {
    expect(
      service.parseAuthorizationReturn({
        nfeProc: {
          protNFe: {
            infProt: {
              nProt: '12345678901234567',
              cStat: 100,
              xMotivo: 'Autorizado o uso da NF-e',
            },
          },
        },
      }),
    ).toEqual({
      protocol: '12345678901234567',
      protocolLength: 17,
      statusCode: '100',
      message: 'Autorizado o uso da NF-e',
    });
  });
});
