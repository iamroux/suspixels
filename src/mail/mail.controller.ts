import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MailService } from './mail.service';
import { BulkMailDto } from './dto/bulk-mail.dto';

@ApiTags('mail')
@Controller('api/mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send-bulk')
  @ApiOperation({ summary: 'Send email to a list of addresses' })
  @ApiResponse({ status: 201, description: 'Returns sent/failed counts' })
  async sendBulk(
    @Body() dto: BulkMailDto,
  ): Promise<{ sent: number; failed: number; errors?: string[] }> {
    return this.mailService.sendBulk(dto.emails, dto.subject, dto.body);
  }
}
