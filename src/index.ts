import type { Env } from './types.js';
import { handleSlackEvent } from './slack/events.js';
import { handleSlackCommand } from './slack/commands.js';
import { runAllDigests } from './digest/daily.js';
import { ChannelRadarDO } from './storage/channel-radar-do.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/slack/events') {
      return handleSlackEvent(request, env, ctx);
    }

    if (pathname === '/slack/commands') {
      return handleSlackCommand(request, env, ctx);
    }

    return new Response('Not found', { status: 404 });
  },

  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runAllDigests(env));
  },
};

export { ChannelRadarDO };
