import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { Garment } from '../dal/entity/garment.entity';
import { Outfit } from '../dal/entity/outfit.entity';
import { OutfitCalendar } from '../dal/entity/outfit-calendar.entity';
import { User } from '../dal/entity/user.entity';
import { FileModule } from '../file/file.module';
import { AuthModule } from '../auth/auth.module';
import { WardrobeShareModule } from '../wardrobe-share/wardrobe-share.module';
import { GarmentService } from './garment.service';
import { OutfitService } from './outfit.service';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { WardrobeController } from './wardrobe.controller';
import { OutfitController } from './outfit.controller';
import { ImportController } from './import/import.controller';
import { ImportService } from './import/import.service';
import { SafeFetchService } from './import/safe-fetch.service';
import { UrlImportService } from './import/url-import.service';

@Module({
  imports: [
    AuthModule,
    FileModule,
    WardrobeShareModule,
    MikroOrmModule.forFeature([Garment, Outfit, OutfitCalendar, User]),
  ],
  controllers: [
    WardrobeController,
    OutfitController,
    CalendarController,
    ImportController,
  ],
  providers: [
    GarmentService,
    OutfitService,
    CalendarService,
    ImportService,
    SafeFetchService,
    UrlImportService,
  ],
  exports: [GarmentService, OutfitService, CalendarService, SafeFetchService],
})
export class WardrobeModule {}
