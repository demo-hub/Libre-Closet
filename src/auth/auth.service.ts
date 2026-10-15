import { EntityManager, EntityRepository, ref } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../dal/entity/user.entity';
import * as bcrypt from 'bcryptjs';
import { ChangePasswordDto } from './dto/changePassword.dto';
import { Payload } from './dto/payload.dto';
import { EmailService } from '../email/email.service';
import { PasswordReset } from '../dal/entity/passwordReset.entity';
import { randomInt } from 'crypto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

export const RESET_CODE_LIFETIME_MINUTES = 15;

export function isResetCodeCurrent(
  passwordReset: Pick<PasswordReset, 'createdAt'>,
  now = new Date(),
): boolean {
  if (!passwordReset.createdAt) return false;
  const age = now.getTime() - passwordReset.createdAt.getTime();
  return age >= 0 && age <= RESET_CODE_LIFETIME_MINUTES * 60 * 1000;
}

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);
  private readonly passwordResetTemplate: Handlebars.TemplateDelegate;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
    private jwtService: JwtService,
    private readonly em: EntityManager,
    private emailService: EmailService,
    @InjectRepository(PasswordReset)
    private passwordResetRepository: EntityRepository<PasswordReset>,
    private readonly configService: ConfigService,
  ) {
    this.passwordResetTemplate = Handlebars.compile(
      readFileSync(
        join(__dirname, '..', '..', 'views', 'email', 'password-reset.hbs'),
        'utf-8',
      ),
    );
  }

  async register(email: string, password: string): Promise<string> {
    this.logger.debug(this.register.name);
    const existingUser = await this.userRepository.findOne({ email });
    if (existingUser) {
      this.logger.debug(`User already exists with email address: ${email}`);
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
    } as User);
    await this.em.persistAndFlush(user);

    return this.jwtService.signAsync({
      userId: user.id,
      email: user.email,
      pwf: hashedPassword.slice(-8),
    } as Payload);
  }

  async signIn(email: string, password: string): Promise<string> {
    const user = await this.userRepository.findOneOrFail({ email });
    const valid = await bcrypt.compare(password, user?.password);
    if (!valid) {
      throw new UnauthorizedException();
    }
    return this.jwtService.signAsync({
      userId: user.id,
      email: user.email,
      pwf: user.password.slice(-8),
    } as Payload);
  }

  public async verifyPwf(payload: Payload) {
    // Verify password fingerprint, tokens invalidate on password change or if missing
    const user = await this.userRepository.findOneOrFail({
      id: payload.userId,
    });
    if (user.password.slice(-8) !== payload.pwf) {
      throw new UnauthorizedException();
    }
  }

  public async changePassword(userId: any, details: ChangePasswordDto) {
    this.logger.debug(this.changePassword.name);
    const user = await this.userRepository.findOneOrFail({ id: userId });

    if (await bcrypt.compare(details.oldPassword, user.password)) {
      const newHashedPassword = await bcrypt.hash(details.newPassword, 12);
      user.password = newHashedPassword;
      return await this.em.persistAndFlush(user);
    }
  }

  public async changeEmail(userId: any, newEmail: string) {
    const user = await this.userRepository.findOneOrFail({ id: userId });
    user.email = newEmail;
    await this.em.persistAndFlush(user);
  }

  async deleteUser(userId: any) {
    const user = await this.userRepository.findOneOrFail({ id: userId });
    await this.em.removeAndFlush(user);
  }

  public async resetPassword(details: ResetPasswordDto) {
    this.logger.debug(this.resetPassword.name);
    const user = await this.userRepository.findOneOrFail({
      email: details.email,
    });

    const passwordReset = await user.passwordReset?.load();
    if (
      !passwordReset ||
      !isResetCodeCurrent(passwordReset) ||
      passwordReset.pin !== details.resetCode
    ) {
      throw new UnauthorizedException('Reset code does not match or expired');
    }

    const hashedPassword = await bcrypt.hash(details.password, 12);
    user.password = hashedPassword;
    // Unlinked and flushed before the code is deleted:
    // user.password_reset_id is "on delete cascade", so deleting a code still
    // linked to its user deletes the user too.
    user.passwordReset = null;
    await this.em.persistAndFlush(user);
    await this.em.removeAndFlush(passwordReset);
  }

  /**
   * Answers the same way whether or not the address has an account, so the
   * reset form cannot be used to find out which addresses do. Throws only
   * when this instance cannot send email at all.
   */
  async sendPasswordResetEmail(email: string) {
    this.logger.debug(this.sendPasswordResetEmail.name);
    if (!this.emailService.isConfigured) {
      throw new Error('Email is not set up on this instance');
    }

    const user = await this.userRepository.findOne({ email });
    if (!user) {
      this.logger.debug('Password reset asked for an address with no account');
      return;
    }

    const previous = await user.passwordReset?.load();
    const pin = randomInt(100000, 999999).toString();
    const passwordReset = this.passwordResetRepository.create({ pin, user });
    user.passwordReset = ref(passwordReset);
    await this.em.persistAndFlush([passwordReset, user]);
    // Only the newest code works. Deleted after the user points at the new
    // one, for the cascade described in resetPassword.
    if (previous) {
      await this.em.removeAndFlush(previous);
    }

    // Not awaited: an address with an account would otherwise answer slower
    // than one without.
    const appName = this.configService.get<string>('APP_NAME');
    this.emailService
      .sendEmailFromPrimaryAddress({
        to: user.email!,
        subject: `${appName}: password reset code`,
        text: `Hello. Use this code to reset your ${appName} password: ${pin}. It works for ${RESET_CODE_LIFETIME_MINUTES} minutes. If you did not ask for a reset, ignore this email.`,
        html: this.passwordResetTemplate({
          appName,
          pin,
          minutes: RESET_CODE_LIFETIME_MINUTES,
        }),
      })
      .catch((error) =>
        this.logger.error('The password reset email was not sent', error),
      );
  }
}
