import { Test, TestingModule } from '@nestjs/testing';
import { EsportsLeagueService } from './esports_league.service';

describe('EsportsLeagueService', () => {
  let service: EsportsLeagueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EsportsLeagueService],
    }).compile();

    service = module.get<EsportsLeagueService>(EsportsLeagueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
