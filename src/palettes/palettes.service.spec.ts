import { Test, TestingModule } from '@nestjs/testing';
import { PalettesService } from './palettes.service';

describe('PalettesService', () => {
  let service: PalettesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PalettesService],
    }).compile();

    service = module.get<PalettesService>(PalettesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
