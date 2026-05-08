import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsHexColor, IsOptional, Min, Max } from 'class-validator';

export class CreatePixelDto {
  @ApiProperty({ example: 199 })
  @IsInt()
  @Min(0)
  @Max(2999)
  x: number;

  @ApiProperty({ example: 192 })
  @IsInt()
  @Min(0)
  @Max(2999)
  y: number;

  @ApiProperty({ example: '#FF5733' })
  @IsString()
  @IsHexColor()
  color: string;

  @ApiProperty({ example: 'Saqib Mir' })
  @IsString()
  @IsOptional()
  insertedBy?: string;
}
