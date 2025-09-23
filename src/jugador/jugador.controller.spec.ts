import { Test, TestingModule } from '@nestjs/testing';
import { JugadorController } from './jugador.controller';
import { JugadorService } from './jugador.service';

describe('JugadorController', () => {
  let controller: JugadorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JugadorController],
      providers: [JugadorService],
    }).compile();

    controller = module.get<JugadorController>(JugadorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
