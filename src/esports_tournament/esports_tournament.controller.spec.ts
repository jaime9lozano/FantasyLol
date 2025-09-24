import { Test, TestingModule } from '@nestjs/testing';
import { EsportsTournamentController } from './esports_tournament.controller';
import { EsportsTournamentService } from './esports_tournament.service';

describe('EsportsTournamentController', () => {
  let controller: EsportsTournamentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EsportsTournamentController],
      providers: [EsportsTournamentService],
    }).compile();

    controller = module.get<EsportsTournamentController>(EsportsTournamentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
