# Tax Scenarios Regression QA

## Objetivo

Contrato regressivo do modulo `tax-scenarios` para impedir mudancas silenciosas em calculos e gates comerciais antes do lancamento.

## Suite ativa

- Versao: `tax-scenarios-regression-2026.1`
- Owner: `tax-scenarios`
- Comando local/EC2: `npm run test:tax-scenarios`
- Criticidades que bloqueiam deploy: `BLOCKER`, `HIGH`

## Regras cobertas

- Limite anual usual do MEI.
- Revisao obrigatoria de MEI com folha informada.
- Limite anual de EPP para Simples Nacional.
- Formula estimativa do Simples por Anexo III e Anexo V.
- Limiar de Fator R em 28%.
- Destaque informativo CBS 0,9% e IBS 0,1% em 2026.
- Gate comercial que impede proposta automatica quando ha bloqueio ou revisao tributaria.

## Politica de alteracao

- Toda alteracao de regra deve atualizar a fixture correspondente, a base legal e a versao da suite.
- Mudanca de valor esperado sem referencia legal ou nota tecnica deve ser tratada como regressao.
- Simulacao comercial deve manter `officialAssessment=false`.
- Apuracao oficial, enquadramento definitivo ou promessa de economia continuam bloqueados ate validacao documental e CRC.
