import { Test, TestingModule } from '@nestjs/testing';
import { RiotEsportsService } from './riot-esports.service';

describe('RiotEsportsService', () => {
  let service: RiotEsportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiotEsportsService],
    }).compile();

    service = module.get<RiotEsportsService>(RiotEsportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
