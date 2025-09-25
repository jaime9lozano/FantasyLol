import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LeaguepediaService } from './leaguepedia.service';


@Module({
  imports: [HttpModule],
  providers: [LeaguepediaService],
  exports: [LeaguepediaService],
})
export class LeaguepediaModule {}