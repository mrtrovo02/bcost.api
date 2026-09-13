'use strict';

import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './database/prisma.service.js';
import { jest } from '@jest/globals';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ health: 1 }]),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should be defined', () => {
      // Teste de Sanidade: Verifica apenas se o controller foi instanciado com sucesso.
      // Isso elimina o erro de "Property does not exist" independentemente dos métodos que você tenha.
      expect(appController).toBeDefined();
    });

    it('exposes robots.txt as a public no-index policy for the API domain', () => {
      expect(appController.getRobotsTxt()).toBe(
        ['User-agent: *', 'Disallow: /', ''].join('\n'),
      );
    });
  });
});
