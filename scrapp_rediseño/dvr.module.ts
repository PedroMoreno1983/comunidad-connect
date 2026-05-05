// =====================================================
// DVR MODULE - INTEGRACIÓN COMPLETA
// =====================================================
// Integra todos los servicios del sistema DVR
// =====================================================

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';

// Servicios del sistema DVR
import { HttpScraperService } from './http-scraper.service';
import { PuppeteerExtractorService } from './puppeteer-extractor.service';
import { HlsProxyService } from './hls-proxy-cached.service';
import { ContinuousDvrService } from './continuous-dvr-final.service';

// Servicio existente de Whisper
import { WhisperService } from '../whisper/whisper.service';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    // Orden de inicio (importante):
    // 1. HTTP Scraper (extrae iframes)
    HttpScraperService,
    
    // 2. Puppeteer Extractor (intercepta streams)
    PuppeteerExtractorService,
    
    // 3. HLS Proxy (mantiene conexiones)
    HlsProxyService,
    
    // 4. Whisper (análisis de audio)
    WhisperService,
    
    // 5. DVR (grabación y detección)
    ContinuousDvrService,
  ],
  exports: [
    HttpScraperService,
    PuppeteerExtractorService,
    HlsProxyService,
    ContinuousDvrService,
  ],
})
export class DvrModule {}