import { Controller, Get, Post, Delete, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PixelsService } from './pixels.service';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { PixelResponseDto } from './dto/pixel-response.dto';
import { DeletePixelDto } from './dto/delete-pixel.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('pixels')
@Controller('api/pixels')
export class PixelsController {
  private readonly logger = new Logger(PixelsController.name);
  private readonly isDevelopment: boolean;

  constructor(
    private readonly pixelsService: PixelsService,
    private readonly configService: ConfigService,
  ) {
    this.isDevelopment = this.configService.get('NODE_ENV') !== 'production';
  }

  @Get()
  @ApiOperation({ summary: 'Get all pixels with metadata' })
  @ApiResponse({
    status: 200,
    description: 'List of pixels',
    type: [PixelResponseDto],
  })
  async getAllPixels(): Promise<PixelResponseDto[]> {
    if (this.isDevelopment) {
      this.logger.debug('GET /api/pixels - Fetching all pixels');
    }
    const pixels = await this.pixelsService.getAllPixels();
    if (this.isDevelopment) {
      this.logger.debug(`GET /api/pixels - Returned ${pixels.length} pixels`);
    }
    return pixels;
  }

  @Post()
  @ApiOperation({ summary: 'Place or update a pixel' })
  @ApiResponse({
    status: 201,
    description: 'Pixel created/updated',
    type: PixelResponseDto,
  })
  async setPixel(
    @Body() createPixelDto: CreatePixelDto,
  ): Promise<PixelResponseDto> {
    if (this.isDevelopment) {
      this.logger.debug(
        `POST /api/pixels - Setting pixel at (${createPixelDto.x}, ${createPixelDto.y}) color: ${createPixelDto.color} by: ${createPixelDto.insertedBy}`,
      );
    }
    const result = await this.pixelsService.setPixel(createPixelDto);
    if (this.isDevelopment) {
      this.logger.debug(
        `POST /api/pixels - Pixel set successfully at (${result.x}, ${result.y})`,
      );
    }
    return result;
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a pixel' })
  @ApiResponse({ status: 200, description: 'Pixel deleted successfully' })
  async deletePixel(
    @Body() deletePixelDto: DeletePixelDto,
  ): Promise<{ x: number; y: number }> {
    if (this.isDevelopment) {
      this.logger.debug(
        `DELETE /api/pixels - Deleting pixel at (${deletePixelDto.x}, ${deletePixelDto.y})`,
      );
    }
    const result = await this.pixelsService.deletePixel(deletePixelDto);
    if (this.isDevelopment) {
      this.logger.debug(
        `DELETE /api/pixels - Pixel deleted at (${result.x}, ${result.y})`,
      );
    }
    return result;
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch create/update/delete pixels' })
  @ApiResponse({
    status: 201,
    description: 'Batch operation completed',
  })
  async batchPixels(
    @Body() batchData: { operations: Array<{ action: 'set' | 'delete'; data: any }> },
  ): Promise<{ success: number; failed: number }> {
    if (this.isDevelopment) {
      this.logger.debug(
        `POST /api/pixels/batch - Processing ${batchData.operations.length} operations`,
      );
    }

    let success = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      batchData.operations.map(async (op) => {
        if (op.action === 'set') {
          return await this.pixelsService.setPixel(op.data);
        } else if (op.action === 'delete') {
          return await this.pixelsService.deletePixel(op.data);
        }
        throw new Error('Invalid operation');
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success++;
      } else {
        failed++;
        if (this.isDevelopment) {
          this.logger.error(
            `Batch operation ${index} failed: ${result.reason}`,
          );
        }
      }
    });

    if (this.isDevelopment) {
      this.logger.debug(
        `POST /api/pixels/batch - Completed: ${success} successful, ${failed} failed`,
      );
    }

    return { success, failed };
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get leaderboard data' })
  @ApiResponse({ status: 200, description: 'Leaderboard data' })
  async getLeaderboard() {
    return this.pixelsService.getLeaderboard();
  }
}
