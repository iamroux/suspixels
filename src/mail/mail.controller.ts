import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MailService } from './mail.service';
import { BulkMailDto } from './dto/bulk-mail.dto';

@ApiTags('mail')
@Controller('api/mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send-bulk')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send welcome email to a list of addresses' })
  @ApiResponse({ status: 201, description: 'Returns sent/failed counts' })
  async sendBulk(
    @Body() dto: BulkMailDto,
  ): Promise<{ sent: number; failed: number }> {
    const results = await Promise.allSettled(
      dto.emails.map((email) => this.mailService.sendWelcomeEmail(email)),
    );

    let sent = 0;
    let failed = 0;
    results.forEach((r) => (r.status === 'fulfilled' ? sent++ : failed++));

    return { sent, failed };
  }
}
