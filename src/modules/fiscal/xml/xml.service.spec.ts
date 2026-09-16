import { XmlService } from './xml.service.js';

describe('XmlService', () => {
  let service: XmlService;

  beforeEach(() => {
    service = new XmlService();
  });

  it('extrai campos NT 2025.002 do Grupo UB em NF-e', () => {
    const xml = `
      <nfeProc>
        <NFe>
          <infNFe Id="NFe35260100000000000000550010000000011000000010">
            <ide>
              <nNF>1</nNF>
              <dhEmi>2026-01-10T10:00:00-03:00</dhEmi>
              <finNFe>6</finNFe>
            </ide>
            <dest>
              <CNPJ>11222333000144</CNPJ>
              <xNome>Cliente Reforma</xNome>
              <enderDest>
                <cMun>3550308</cMun>
              </enderDest>
            </dest>
            <det>
              <imposto>
                <IBSCBS>
                  <CST>000</CST>
                  <cClassTrib>000001</cClassTrib>
                  <gCBS>
                    <vCBS>9.00</vCBS>
                  </gCBS>
                  <gIBS>
                    <vIBS>1.00</vIBS>
                  </gIBS>
                </IBSCBS>
              </imposto>
            </det>
            <total>
              <ICMSTot>
                <vNF>1000.00</vNF>
                <vBC>1000.00</vBC>
              </ICMSTot>
            </total>
          </infNFe>
        </NFe>
      </nfeProc>
    `;

    const result = service.parseInvoiceXml(xml);

    expect(result.finNFe).toBe('6');
    expect(result.issuePurpose).toBe('CREDIT_NOTE');
    expect(result.cstCode).toBe('000');
    expect(result.cClassTribCode).toBe('000001');
    expect(result.destinationMunicipalityIbge).toBe('3550308');
    expect(result.taxReformPayload).toMatchObject({
      group: 'UB',
      cbsValue: 9,
      ibsValue: 1,
      selectiveTaxValue: 0,
    });
  });

  it('marca presença de impostos legados quando há ICMS/PIS/COFINS/IPI nos itens', () => {
    const xml = `
      <NFe>
        <infNFe Id="NFe35260100000000000000550010000000011000000011">
          <ide><nNF>2</nNF><finNFe>1</finNFe></ide>
          <dest><CPF>12345678901</CPF><xNome>Cliente</xNome></dest>
          <det><imposto><ICMS><ICMS00 /></ICMS></imposto></det>
          <total><ICMSTot><vNF>100.00</vNF></ICMSTot></total>
        </infNFe>
      </NFe>
    `;

    expect(service.parseInvoiceXml(xml).hasLegacyTaxes).toBe(true);
  });
});
