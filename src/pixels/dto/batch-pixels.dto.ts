import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
  IsHexColor,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BatchOperationDataDto {
  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  @Max(2999)
  x: number;

  @ApiProperty({ example: 200 })
  @IsInt()
  @Min(0)
  @Max(2999)
  y: number;

  @ApiProperty({ example: '#FF5733', required: false })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class BatchOperationDto {
  @ApiProperty({ enum: ['set', 'delete'] })
  @IsIn(['set', 'delete'])
  action: 'set' | 'delete';

  @ApiProperty({ type: () => BatchOperationDataDto })
  @ValidateNested()
  @Type(() => BatchOperationDataDto)
  data: BatchOperationDataDto;
}

export class BatchPixelsDto {
  @ApiProperty({ type: [BatchOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BatchOperationDto)
  operations: BatchOperationDto[];
}
