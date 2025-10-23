import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePixelDto } from './create-pixel.dto';
import { DeletePixelDto } from './delete-pixel.dto';

export class BatchPixelOperation {
  action: 'set' | 'delete';
  pixel: CreatePixelDto | DeletePixelDto;
}

export class BatchPixelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchPixelOperation)
  operations: BatchPixelOperation[];
}

