import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { LeaguepediaModule } from './leaguepedia/leaguepedia.module';
import { CoreModule } from './core/core.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  
imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LeaguepediaModule,
    CoreModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
