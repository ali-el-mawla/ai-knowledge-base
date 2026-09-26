import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import { type SendMessageBody, sendMessageSchema } from '@repo/shared';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AppRequest } from '../common/http/app-request.js';
import { ParseUuidPipe, ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { createSseSink } from './chat-event-sink.js';
import { ChatService } from './chat.service.js';

/**
 * Every message costs a model call, so chat gets a far stricter limit than the default
 * 300 per minute: 20 messages per minute per user (the throttler tracks signed-in users
 * by id). It overrides the default throttler for this route only.
 */
export const CHAT_RATE_LIMIT = { limit: 20, ttl: minutes(1) };

@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /**
   * Streams the answer as server-sent events over a plain POST response. Not `@Sse()`:
   * that only serves GET, and browsers' EventSource cannot send the Authorization header;
   * the web app reads this stream with fetch.
   *
   * Authentication, the rate limit, validation and the ownership check all run before the
   * first byte, so their failures are ordinary JSON errors (401, 429, 400, 404, 503).
   */
  @Post(':id/messages')
  @Throttle({ default: CHAT_RATE_LIMIT })
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageBody,
    @Req() req: AppRequest,
    @Res() res: Response,
  ): Promise<void> {
    const disconnect = new AbortController();
    // 'close' fires when the response is done or the connection drops; only an unfinished
    // response means the client left (Stop, closed tab), which cancels the model call.
    // (The request's own 'close' is no signal: it fires once the body has been read.)
    res.on('close', () => {
      if (!res.writableFinished) disconnect.abort();
    });
    // A client that left while the guards ran has already fired 'close'.
    if (req.socket.destroyed) disconnect.abort();
    await this.chat.reply(
      { user, conversationId, question: body.content, requestId: req.requestId },
      createSseSink(res),
      disconnect.signal,
    );
  }
}
