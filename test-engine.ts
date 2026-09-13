'use strict';

import { Prisma } from '@prisma/client';
import { ReconciliationScoreEngine, ScoreContext } from './src/modules/reconciliation/scoring/reconciliation.score';

async function runTests() {
  console.log('🚀 Iniciando Testes do Motor de Score - bCost 2026\n');

  const tests = [
    {
      name: '🔥 CENÁRIO 1: Match Perfeito (105 Pontos)',
      ctx: {
        transaction: {
          amount: new Prisma.Decimal(1500.00),
          date: new Date('2026-02-07'),
          description: 'PIX RECEBIDO - CLIENTE ACME LTDA'
        },
        invoice: {
          totalValue: new Prisma.Decimal(1500.00),
          issueDate: new Date('2026-02-07'),
          customerName: 'ACME LTDA',
          hasCustomer: true
        }
      }
    },
    {
      name: '⚖️ CENÁRIO 2: Valor com Diferença de 1% (Margem de Erro)',
      ctx: {
        transaction: {
          amount: new Prisma.Decimal(99.00), // Diferença de 1 real para 100
          date: new Date('2026-02-07'),
          description: 'PAGAMENTO BOLETO'
        },
        invoice: {
          totalValue: new Prisma.Decimal(100.00),
          issueDate: new Date('2026-02-07'),
          customerName: null,
          hasCustomer: false
        }
      }
    },
    {
      name: '📅 CENÁRIO 3: Compensação D+2 (Final de Semana)',
      ctx: {
        transaction: {
          amount: new Prisma.Decimal(500.00),
          date: new Date('2026-02-09'), // Segunda-feira
          description: 'DOC/TED RECEBIDO'
        },
        invoice: {
          totalValue: new Prisma.Decimal(500.00),
          issueDate: new Date('2026-02-07'), // Sábado anterior
          customerName: null,
          hasCustomer: true
        }
      }
    },
    {
      name: '❌ CENÁRIO 4: Falha (Valores totalmente diferentes)',
      ctx: {
        transaction: {
          amount: new Prisma.Decimal(10.00),
          date: new Date('2026-02-07'),
          description: 'TARIFA BANCARIA'
        },
        invoice: {
          totalValue: new Prisma.Decimal(5000.00),
          issueDate: new Date('2026-01-01'),
          customerName: 'OUTRO CLIENTE',
          hasCustomer: true
        }
      }
    }
  ];

  tests.forEach((t, i) => {
    const score = ReconciliationScoreEngine.calculate(t.ctx as ScoreContext);
    const status = score >= 70 ? '✅ APROVADO PARA AUTO-MATCH' : '⚠️ REQUER REVISÃO MANUAL';
    
    console.log(`--------------------------------------------------`);
    console.log(`${t.name}`);
    console.log(`Score: ${score} | Status: ${status}`);
  });

  console.log(`\n--------------------------------------------------`);
  console.log('✅ Testes Finalizados.');
}

runTests().catch(console.error);