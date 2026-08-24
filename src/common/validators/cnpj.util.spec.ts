import {
  isValidCnpj,
  normalizeCnpj,
  normalizeCnpjRegistration,
} from './cnpj.util.js';

describe('cnpj.util', () => {
  it('normaliza CNPJ com mascara', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('normaliza CNPJ alfanumerico preservando letras oficiais', () => {
    expect(normalizeCnpjRegistration('12.ABC.345/01DE-35')).toBe(
      '12ABC34501DE35',
    );
  });

  it('valida CNPJ com digitos verificadores corretos', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('valida CNPJ alfanumerico com digitos verificadores oficiais', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
  });

  it('rejeita CNPJ com digitos repetidos ou verificadores invalidos', () => {
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
  });

  it('rejeita CNPJ alfanumerico com DV invalido ou DV nao numerico', () => {
    expect(isValidCnpj('12ABC34501DE34')).toBe(false);
    expect(isValidCnpj('12ABC34501DE3A')).toBe(false);
  });
});
