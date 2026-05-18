import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BulkMailDto {
  @ApiProperty({ example: ['alice@example.com', 'bob@example.com'] })
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  emails: string[];
}
