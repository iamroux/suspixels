import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class DeletePixelDto {
  @ApiProperty({ description: 'X coordinate of the pixel to delete' })
  @IsInt()
  @Min(0)
  @Max(2999)
  x: number;

  @ApiProperty({ description: 'Y coordinate of the pixel to delete' })
  @IsInt()
  @Min(0)
  @Max(2999)
  y: number;
}
