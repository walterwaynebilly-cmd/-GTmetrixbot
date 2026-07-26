const axios = require('axios');

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

async function runAudit(url, strategy = 'mobile', apiKey) {
  const params = new URLSearchParams();
  params.append('url', url);
  params.append('strategy', strategy);
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach((c) =>
    params.append('category', c)
  );
  if (apiKey) params.append('key', apiKey);

  const { data } = await axios.get(`${PSI_ENDPOINT}?${params.toString()}`, {
    timeout: 55000,
  });

  const lhr = data.lighthouseResult;
  if (!lhr) throw new Error('No Lighthouse result returned for this URL.');

  const categories = lhr.categories;
  const audits = lhr.audits;

  const scores = {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
  };

  const vitals = {
    lcp: audits['largest-contentful-paint']?.displayValue,
    cls: audits['cumulative-layout-shift']?.displayValue,
    tbt: audits['total-blocking-time']?.displayValue,
    fcp: audits['first-contentful-paint']?.displayValue,
    speedIndex: audits['speed-index']?.displayValue,
    tti: audits['interactive']?.displayValue,
  };

  const opportunities = Object.values(audits)
    .filter(
      (a) =>
        a.details &&
        a.details.type === 'opportunity' &&
        a.score !== null &&
        a.score < 1 &&
        a.details.overallSavingsMs > 0
    )
    .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs)
    .slice(0, 5)
    .map((a) => ({
      title: a.title,
      savingsMs: Math.round(a.details.overallSavingsMs),
    }));

  return {
    finalUrl: lhr.finalUrl,
    fetchTime: lhr.fetchTime,
    strategy,
    scores,
    vitals,
    opportunities,
  };
}

module.exports = { runAudit };
