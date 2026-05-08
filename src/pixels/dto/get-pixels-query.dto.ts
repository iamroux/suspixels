import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetPixelsQueryDto {
  @ApiProperty({ required: false, description: 'Viewport left edge (grid coords)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2999)
  x?: number;

  @ApiProperty({ required: false, description: 'Viewport top edge (grid coords)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2999)
  y?: number;

  @ApiProperty({ required: false, description: 'Viewport width in grid pixels' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3000)
  w?: number;

  @ApiProperty({ required: false, description: 'Viewport height in grid pixels' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3000)
  h?: number;
}
