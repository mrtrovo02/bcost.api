# Diretriz de Produto: bCost Contabilidade Digital End-to-End

## Principio central

A bCost deve evoluir para uma plataforma propria de Contabilidade Digital End-to-End, com cobertura funcional equivalente aos principais players do mercado, sem copiar marca, textos, nomenclatura proprietaria, fluxos internos ou materiais comerciais de terceiros.

O criterio de produto e engenharia e: vender apenas o que existir como workflow operacional rastreavel, com regra oficial, evidencia, responsavel tecnico e limite claro entre software, integracao governamental e execucao humana.

## Regras de implementacao

1. Todo servico contabil, fiscal, trabalhista, societario ou fintech deve declarar perfil de execucao operacional.
2. Servicos regulados devem referenciar fonte oficial, leiaute, portal, prazo ou base normativa aplicavel.
3. Nenhum fallback demonstrativo pode ser usado em sessao real de producao.
4. Automacao nao substitui validacao CRC quando houver responsabilidade contábil, fiscal, trabalhista ou assinatura tecnica.
5. Protocolos, recibos, XMLs, guias, declaracoes e evidencias devem ser persistidos ou vinculados ao workflow.
6. O cliente deve visualizar status operacional real: pendente, em execucao, aguardando cliente, aguardando orgao publico, em revisao CRC, concluido ou bloqueado.
7. Integracoes oficiais devem ser tratadas como adaptadores substituiveis: API oficial quando existir, RPA governamental quando inevitavel, backoffice humano quando houver exigencia legal ou indisponibilidade digital.

## Blocos de produto

### 1. Setup e entrada de clientes

- Abertura de empresa, contrato social, natureza juridica, CNAE, viabilidade, Redesim, Junta Comercial, CNPJ, inscricao municipal/estadual e alvara.
- Migracao de contabilidade tradicional, regularizacao inicial, importacao de documentos e transicao MEI para ME.
- Engenharia: workflow de documentos, checklist, protocolos, integracoes ou RPA, validacao humana e evidencias.

### 2. Core contabil e fiscal recorrente

- PGDAS-D, DAS, fator R, DEFIS, DCTFWeb, EFD-Reinf, eSocial, SPED, ECD, ECF, livros, BP, DRE e Livro Caixa.
- Engenharia: motor fiscal parametrizado por regime, competencia, CNAE, municipio/UF, anexos e eventos; jobs assincronos; recibos oficiais; revisao CRC.

### 3. Valor agregado e fintech

- NFS-e/NF-e, certificados digitais, Open Finance, BaaS, conciliacao, boletos, conta PJ, endereco fiscal e escritorio virtual.
- Engenharia: certificados A1/A3, adaptadores SEFAZ/NFS-e/prefeituras, consentimento Open Finance, parceiro regulado para BaaS e trilha de auditoria.

### 4. Plataforma versus operacao humana

| Tipo de servico | Automacao maxima segura | Camada humana obrigatoria |
| --- | --- | --- |
| Importacao XML, classificacao, dashboards e alertas | Alta | Revisao por excecao |
| DAS/PGDAS-D/DEFIS/DCTFWeb/SPED/eSocial | Assistida | Validacao CRC e recibo oficial |
| Abertura, alteracao e baixa | Assistida | Backoffice societario e protocolos |
| NFS-e municipal | Variavel por municipio | Suporte operacional quando prefeitura nao tem API |
| Conta PJ/BaaS/Open Finance | Alta via parceiro | KYC/KYB, suporte e compliance regulatorio |
| Demonstracoes oficiais | Assistida | Assinatura e responsabilidade tecnica CRC |

## Implicacao arquitetural

O modulo `service-catalog` passa a ser a fonte de verdade de escopo comercial e operacional. Cada microservico avaliado deve retornar:

- nivel de automacao;
- engines de execucao;
- alvo de integracao;
- evidencias esperadas;
- necessidade de credencial oficial;
- necessidade de validacao CRC;
- necessidade de acao do cliente;
- maturidade para producao.
