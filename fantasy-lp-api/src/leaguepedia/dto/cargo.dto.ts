// Respuesta genérica de Cargo
export interface CargoResponse<T> {
  cargoquery: Array<{ title: T }>;
}

/** Tournaments (tabs/ligas/splits) */
export interface LpTournamentRow {
  Name?: string;
  OverviewPage: string;
  League?: string;
  Region?: string;
  Year?: number;
  IsOfficial?: string;   // "1"/"0"
  DateStart?: string;    // "YYYY-MM-DD"
  Date?: string;         // "YYYY-MM-DD"
  Split?: string;
  TournamentLevel?: string;
  LeagueIconKey?: string;
}

/** Teams (catálogo) */
export interface LpTeamRow {
  TeamPage: string;      // Teams.OverviewPage
  TeamName: string;      // Teams.Name
  Short?: string;
  Region?: string;
  Location?: string;
  LogoFile?: string;     // Teams.Image
}

/** ScoreboardGames / MatchScheduleGame (calendario) */
export interface LpGameRow {
  GameId: string;
  DateTimeUTC: string;   // SG.DateTime_UTC
  Team1?: string;        // SG.Team1
  Team2?: string;        // SG.Team2
  WinTeam?: string;      // SG.WinTeam
  LossTeam?: string;     // SG.LossTeam
  Winner?: string;       // SG.Winner "1"/"2"
  Patch?: string;
  OverviewPage?: string; // SG.OverviewPage
  Tournament?: string;   // T.Name
}

/** ScoreboardPlayers (stats por jugador y partida / roster ventana) */
export interface LpPlayerGameStatRow {
  PlayerPage: string;    // SP.Link (ID LP)
  Team: string;
  Role?: string;
  Kills?: number | string;
  Deaths?: number | string;
  Assists?: number | string;
  Gold?: number | string;
  CS?: number | string;
  Champion?: string;
  DateTimeUTC: string;   // SP.DateTime_UTC
  GameId: string;
  PlayerWin?: 'Yes' | 'No';
}

/** Players (catálogo) */
export interface LpPlayerRow {
  PlayerPage: string;    // Players.OverviewPage
  DisplayName?: string;  // Players.ID
  Country?: string;      // Players.NationalityPrimary
  PhotoFile?: string;    // Players.Image
  Role?: string;         // Players.Role (histórico/generic)
}

/** ImageInfo (resolver File:*.png → URL) */
export interface ImageInfoResponse {
  query: {
    pages: {
      [key: string]: {
        title?: string;
        imageinfo?: Array<{ url: string }>;
      };
    };
  };
}
