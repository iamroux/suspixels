import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, ArrayMinSize, ArrayMaxSize, IsString, IsNotEmpty } from 'class-validator';

export class BulkMailDto {
  @ApiProperty({ example: ['alice@example.com', 'bob@example.com'] })
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  emails: string[];

  @ApiProperty({ example: 'Welcome to Suspixels!' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ example: '<h1>Hello!</h1><p>Thanks for joining.</p>' })
  @IsString()
  @IsNotEmpty()
  body: string;
}
