import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { LeaguepediaModule } from './leaguepedia/leaguepedia.module';
import { ConfigModule } from '@nestjs/config';
import { CronModule } from './cron/cron.module';

@Module({
  
imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LeaguepediaModule,
    CronModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
