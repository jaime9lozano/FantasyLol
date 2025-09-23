import { Test, TestingModule } from '@nestjs/testing';
import { JugadorService } from './jugador.service';

describe('JugadorService', () => {
  let service: JugadorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JugadorService],
    }).compile();

    service = module.get<JugadorService>(JugadorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
