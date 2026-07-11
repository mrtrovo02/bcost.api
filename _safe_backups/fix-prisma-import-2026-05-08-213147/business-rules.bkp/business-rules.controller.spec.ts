import { Test, TestingModule } from '@nestjs/testing';
import { BusinessRulesController } from './business-rules.controller';
import { BusinessRulesService } from './business-rules.service';
import { jest } from '@jest/globals';

describe('BusinessRulesController', () => {
  let controller: BusinessRulesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessRulesController],
      providers: [
        {
          provide: BusinessRulesService,
          useValue: {
            findAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BusinessRulesController>(BusinessRulesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
