import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RiotService {
  private readonly riotApiKey: string;
  private readonly riotBaseUrl = 'https://euw1.api.riotgames.com';

  
 constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('RIOT_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('RIOT_API_KEY is not set in environment variables');
    }
    this.riotApiKey = apiKey;
  }


  async getSummonerByName(summonerName: string) {
    const url = `${this.riotBaseUrl}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
    const response = await this.httpService.axiosRef.get(url, {
      headers: {
        'X-Riot-Token': this.riotApiKey,
      },
    });
    return response.data;
  }

  async getRankedStatsBySummonerId(summonerId: string) {
    const url = `${this.riotBaseUrl}/lol/league/v4/entries/by-summoner/${summonerId}`;
    const response = await this.httpService.axiosRef.get(url, {
      headers: {
        'X-Riot-Token': this.riotApiKey,
      },
    });
    return response.data;
  }
}


