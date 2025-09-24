import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Jugador } from './entities/jugador.entity';
import { Equipo } from 'src/equipo/entities/equipo.entity';
import { Region } from 'src/region/entities/region.entity';
import { Rol } from 'src/rol/entities/rol.entity';
import { RiotService } from 'src/riot/riot.service';

@Injectable()
export class JugadorService {
  constructor(
    @InjectRepository(Jugador)
    private readonly jugadorRepository: Repository<Jugador>,
    @InjectRepository(Equipo)
    private readonly equipoRepository: Repository<Equipo>,
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
    @InjectRepository(Rol)
    private readonly rolRepository: Repository<Rol>,
    private readonly riotService: RiotService,
  ) {}

  /** Crear jugador desde Riot API */
  async createFromRiot(
    summonerName: string,
    teamId: number,
    regionId: number,
    roleId: number,
  ): Promise<Jugador> {
    const equipo = await this.equipoRepository.findOne({ where: { id: teamId } });
    const region = await this.regionRepository.findOne({ where: { id: regionId } });
    const rol = await this.rolRepository.findOne({ where: { id: roleId } });

    if (!equipo || !region || !rol) {
      throw new BadRequestException('Equipo, región o rol no válidos');
    }

    const summoner = await this.riotService.getSummonerByName(summonerName);
    const rankedStats = await this.riotService.getRankedStatsBySummonerId(summoner.id);

    const soloQ = rankedStats.find((q) => q.queueType === 'RANKED_SOLO_5x5');

    // Comprobar duplicados por summoner_id, puuid, account_id, summoner_name
    const exists = await this.jugadorRepository.findOne({
      where: [
        { summoner_id: summoner.id },
        { puuid: summoner.puuid },
        { account_id: summoner.accountId },
        { summoner_name: summoner.name },
      ],
    });
    if (exists) throw new ConflictException('El jugador ya existe en la base de datos');

    const jugador = this.jugadorRepository.create({
      summoner_id: summoner.id,
      puuid: summoner.puuid,
      summoner_name: summoner.name,
      account_id: summoner.accountId,
      tier: soloQ?.tier || null,
      league_points: soloQ?.leaguePoints || null,
      team_id: teamId,
      Region_id: regionId,
      Main_role_id: roleId,
    });

    return this.jugadorRepository.save(jugador);
  }
}

