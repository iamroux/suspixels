import { Test, TestingModule } from '@nestjs/testing';
import { PalettesController } from './palettes.controller';

describe('PalettesController', () => {
  let controller: PalettesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PalettesController],
    }).compile();

    controller = module.get<PalettesController>(PalettesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
