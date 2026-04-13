import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { ClubCreationRequestsService } from './club-creation-requests.service';
import { CreateClubCreationRequestDto } from './dto/create-club-creation-request.dto';
import { UpdateClubCreationRequestStatusDto } from './dto/update-club-creation-request-status.dto';

@Controller('club-creation-requests')
@UseGuards(AuthGuard('jwt'))
export class ClubCreationRequestsController {
  constructor(
    private readonly clubCreationRequestsService: ClubCreationRequestsService,
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'cv', maxCount: 1 },
        { name: 'attestation', maxCount: 1 },
        { name: 'logo', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads',
          filename: (req, file, cb) => {
            const randomName = Array(24)
              .fill(null)
              .map(() => Math.round(Math.random() * 16).toString(16))
              .join('');
            cb(null, `${randomName}${extname(file.originalname)}`);
          },
        }),
      },
    ),
  )
  create(
    @Request() req: any,
    @Body() dto: CreateClubCreationRequestDto,
    @UploadedFiles()
    files: {
      cv?: Express.Multer.File[];
      attestation?: Express.Multer.File[];
      logo?: Express.Multer.File[];
    },
  ) {
    return this.clubCreationRequestsService.create(
      req.user.userId,
      req.user.role,
      dto,
      files,
    );
  }

  @Get('mine')
  findMine(@Request() req: any) {
    return this.clubCreationRequestsService.findMine(req.user.userId);
  }

  @Get('categories')
  findCategories() {
    return this.clubCreationRequestsService.findCategories();
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  findAll(@Request() req: any, @Query('statut') statut?: string) {
    return this.clubCreationRequestsService.findAll(
      req.user.userId,
      req.user.role,
      statut,
    );
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateClubCreationRequestStatusDto,
  ) {
    return this.clubCreationRequestsService.updateStatus(
      id,
      req.user.userId,
      req.user.role,
      dto,
    );
  }
}
