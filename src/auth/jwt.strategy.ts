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
    // The token's signature already proves identity. Refresh the display name
    // from the DB when reachable, but never fail auth on a DB outage — fall
    // back to the name embedded in the token. Keeps canvas + auth working when
    // Postgres is briefly unavailable.
    let name = payload.name;
    try {
      const user = await this.usersService.findById(payload.sub);
      if (user) name = user.name;
    } catch {
      // DB unavailable — use the token's name
    }
    return { userId: payload.sub, email: payload.email, name };
  }
}
