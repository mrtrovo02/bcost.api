import { isValidCnpj, normalizeCnpj } from './cnpj.util.js';

describe('cnpj.util', () => {
  it('normaliza CNPJ com mascara', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('valida CNPJ com digitos verificadores corretos', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita CNPJ com digitos repetidos ou verificadores invalidos', () => {
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
  });
});
