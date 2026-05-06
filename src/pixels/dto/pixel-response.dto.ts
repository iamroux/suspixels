import { ApiProperty } from '@nestjs/swagger';

export class PixelResponseDto {
  @ApiProperty()
  x: number;

  @ApiProperty()
  y: number;

  @ApiProperty()
  color: string;

  @ApiProperty({ required: false })
  insertedBy?: string;

  @ApiProperty({ required: false })
  userId?: string;

  @ApiProperty({ required: false })
  updatedAt?: Date;
}
