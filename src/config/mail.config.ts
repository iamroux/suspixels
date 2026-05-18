import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  user: process.env.MAIL_USER,
  password: process.env.MAIL_APP_PASSWORD,
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
}));
