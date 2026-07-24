require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { runAudit } = require('./pagespeed');
const { addEntry, getHistory } = require('./history');
const { buildPdfBuffer } = require('./report-pdf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PSI_API_KEY = process.env.PSI_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.RAILWAY_STATIC_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN environment variable.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const lastUrlByChat = new Map();
const lastReportByChat = new Map();

function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function scoreEmoji(score) {
  if (score >= 90) return '🟢';
  if (score >= 50) return '🟠';
  return '🔴';
}

function formatReport(report) {
  const { finalUrl, strategy, scores, vitals, opportunities } = report;

  let msg = `📊 *PageSpeed Report*\n`;
  msg += `🔗 ${finalUrl}\n`;
  msg += `📱 Strategy: *${strategy}*\n\n`;

  msg += `*Scores*\n`;
  msg += `${scoreEmoji(scores.performance)} Performance: *${scores.performance}*\n`;
  msg += `${scoreEmoji(scores.accessibility)} Accessibility: *${scores.accessibility}*\n`;
  msg += `${scoreEmoji(scores.bestPractices)} Best Practices: *${scores.bestPractices}*\n`;
  msg += `${scoreEmoji(scores.seo)} SEO: *${scores.seo}*\n\n`;

  msg += `*Core Web Vitals*\n`;
  msg += `⏱ LCP (Largest Contentful Paint): ${vitals.lcp || 'n/a'}\n`;
  msg += `📐 CLS (Cumulative Layout Shift): ${vitals.cls || 'n/a'}\n`;
  msg += `🚧 TBT (Total Blocking Time): ${vitals.tbt || 'n/a'}\n`;
  msg += `🎨 FCP (First Contentful Paint): ${vitals.fcp || 'n/a'}\n`;
  msg += `⚡ Speed Index: ${vitals.speedIndex || 'n/a'}\n`;
  msg += `✅ Time to Interactive: ${vitals.tti || 'n/a'}\n`;

  if (opportunities.length) {
    msg += `\n*Top Opportunities*\n`;
    opportunities.forEach((o) => {
      msg += `• ${o.title} — save ~${o.savingsMs}ms\n`;
    });
  }

  return msg;
}

bot.start((ctx) =>
  ctx.reply(
    '👋 Welcome to *GTmetrixBot*!\n\n' +
      'Send me any website URL and I\'ll run a full performance audit — ' +
      'scores, Core Web Vitals, and optimization opportunities.\n\n' +
      'Or use: `/test example.com`',
    { parse_mode: 'Markdown' }
  )
);

bot.help((ctx) =>
  ctx.reply(
    'Just send a URL, or use /test <url>.\n' +
      'Example: /test https://example.com\n\n' +
      '/history — see your last 10 tests in this chat.\n' +
      'Tap "Export PDF" on any report to get a downloadable file.'
  )
);

async function handleTest(ctx, rawUrl, strategy = 'mobile') {
  if (!rawUrl) {
    return ctx.reply('Please provide a URL. Example: /test example.com');
  }
  const url = normalizeUrl(rawUrl);
  lastUrlByChat.set(ctx.chat.id, url);

  const statusMsg = await ctx.reply(
    `🔍 Analyzing ${url} (${strategy})… this can take 20–40 seconds.`
  );

  try {
    const report = await runAudit(url, strategy, PSI_API_KEY);
    const otherStrategy = strategy === 'mobile' ? 'desktop' : 'mobile';

    lastReportByChat.set(ctx.chat.id, report);
    addEntry(ctx.chat.id, {
      url: report.finalUrl,
      strategy,
      performance: report.scores.performance,
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      formatReport(report),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `Run ${otherStrategy} test`,
              `retest:${otherStrategy}`
            ),
          ],
          [Markup.button.callback('📄 Export PDF', 'export:pdf')],
        ]),
      }
    );
  } catch (err) {
    console.error(err.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Couldn't analyze that URL.\n${err.response?.data?.error?.message || err.message}`
    );
  }
}

bot.command('test', (ctx) => {
  const arg = ctx.message.text.split(' ').slice(1).join(' ');
  handleTest(ctx, arg, 'mobile');
});

bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();
  if (/^\/(?!test)/.test(text)) return;
  if (text.startsWith('/test')) return;
  if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+.*$/i.test(text)) {
    handleTest(ctx, text, 'mobile');
  }
});

bot.command('history', (ctx) => {
  const entries = getHistory(ctx.chat.id);
  if (!entries.length) {
    return ctx.reply('No tests run yet in this chat. Send a URL to get started.');
  }
  const lines = entries.map((e, i) => {
    const when = new Date(e.timestamp).toLocaleString();
    return `${i + 1}. ${e.url} (${e.strategy}) — Performance: ${e.performance} — ${when}`;
  });
  ctx.reply(`🕘 *Last ${entries.length} tests*\n\n${lines.join('\n')}`, {
    parse_mode: 'Markdown',
  });
});

bot.action('export:pdf', async (ctx) => {
  await ctx.answerCbQuery('Generating PDF…');
  const report = lastReportByChat.get(ctx.chat.id);
  if (!report) {
    return ctx.reply('No report to export yet — run a test first.');
  }
  try {
    const pdfBuffer = await buildPdfBuffer(report);
    const safeName = report.finalUrl.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    await ctx.replyWithDocument({
      source: pdfBuffer,
      filename: `gtmetrixbot-${safeName}.pdf`,
    });
  } catch (err) {
    console.error(err.message);
    ctx.reply('❌ Could not generate the PDF.');
  }
});

bot.action(/retest:(mobile|desktop)/, async (ctx) => {
  const strategy = ctx.match[1];
  const url = lastUrlByChat.get(ctx.chat.id);
  await ctx.answerCbQuery();
  if (!url) {
    return ctx.reply('Send a URL first, then I can re-test it.');
  }
  handleTest(ctx, url, strategy);
});

if (WEBHOOK_URL) {
  const app = express();
  app.use(bot.webhookCallback('/telegram-webhook'));
  app.get('/', (_req, res) => res.send('GTmetrixBot is running.'));
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram-webhook`);
    console.log(`Webhook set to ${WEBHOOK_URL}/telegram-webhook`);
  });
} else {
  bot.launch();
  console.log('Bot launched with long polling (no WEBHOOK_URL set).');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
