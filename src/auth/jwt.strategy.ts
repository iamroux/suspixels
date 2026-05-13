import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primary: httpOnly cookie
        (req: Request) => req?.cookies?.access_token ?? null,
        // Fallback: Authorization header (Swagger UI / API clients)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'fallbackSecretForDevOnly',
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    return { userId: payload.sub, email: payload.email, name: user ? user.name : payload.name };
  }
}
