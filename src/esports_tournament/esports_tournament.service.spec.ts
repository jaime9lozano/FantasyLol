import { Test, TestingModule } from '@nestjs/testing';
import { EsportsTournamentService } from './esports_tournament.service';

describe('EsportsTournamentService', () => {
  let service: EsportsTournamentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EsportsTournamentService],
    }).compile();

    service = module.get<EsportsTournamentService>(EsportsTournamentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
