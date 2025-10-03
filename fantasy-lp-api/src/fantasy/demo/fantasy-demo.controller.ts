// src/fantasy/demo/fantasy-demo.controller.ts
import { Controller, Post } from '@nestjs/common';
import { FantasyDemoService } from './fantasy-demo.service';

@Controller('diag/fantasy/demo')
export class FantasyDemoController {
  constructor(private readonly svc: FantasyDemoService) {}

  @Post('run')
  run() {
    return this.svc.runDemo();
  }
}