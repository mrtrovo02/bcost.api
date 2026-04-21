// src/modules/notifications/external-notifier.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExternalNotifierService {
  private readonly logger = new Logger(ExternalNotifierService.name);

  constructor(private configService: ConfigService) {}

  async sendDiscordAlert(
    title: string,
    message: string,
    color: number = 15158332,
  ) {
    const webhookUrl = this.configService.get<string>('DISCORD_WEBHOOK_URL');
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: `🚀 bCost Engine Alert: ${title}`,
              description: message,
              color: color,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    } catch (error) {
      this.logger.error('Falha ao enviar webhook para Discord', error);
    }
  }
}
