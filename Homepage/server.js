const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'cricket-website-szymon-frontend/Homepage')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'cricket-website-szymon-frontend/Homepage/index.html'));
});

const fetchHTML = async (url) => {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    },
    timeout: 12000
  });
  return response.data;
};

const parseCricketScore = ($) => {
  const getText = (selector) => $(selector).first().text().trim() || '';
  const getAny = (...selectors) => {
    for (const sel of selectors) {
      const t = $(sel).first().text().trim();
      if (t) return t;
    }
    return '';
  };

  const liveStatuses = [
    '.cb-text-inprogress',
    '.cb-text-stumps',
    '.cb-text-lunch',
    '.cb-text-inningsbreak',
    '.cb-text-tea',
    '.cb-text-rain',
    '.cb-text-wetoutfield',
    '.cb-text-delay'
  ];

  const allStatusSelectors = [
    '.cb-col.cb-col-100.cb-min-stts.cb-text-complete',
    '.cb-text-inprogress',
    '.cb-col.cb-col-100.cb-font-18.cb-toss-sts.cb-text-abandon',
    '.cb-text-stumps',
    '.cb-text-lunch',
    '.cb-text-inningsbreak',
    '.cb-text-tea',
    '.cb-text-rain',
    '.cb-text-wetoutfield',
    '.cb-text-delay',
    '.cb-col.cb-col-100.cb-font-18.cb-toss-sts',
    '.cb-min-stts'
  ];

  const isLive = liveStatuses.some(sel => $(sel).first().text().trim() !== '');

  const matchUpdate = allStatusSelectors
    .map((selector) => $(selector).first().text().trim())
    .find((status) => status) || '';

  const matchDateElement = $('span[itemprop="startDate"]').attr('content');
  const matchDate = matchDateElement && new Date(matchDateElement).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true
  });

  const rawTitle = getText('h1.cb-nav-hdr');
  const title = rawTitle
    .replace(' - Live Cricket Score, Commentary', '')
    .replace(' - Live Cricket Score', '')
    .trim();

  const livescore = getAny('.cb-font-20.text-bold', '.cb-ovr-flo.cb-font-20.text-bold');
  const runrate = getAny('.cb-font-12.cb-text-gray', '.cb-text-gray.cb-font-12');

  const tossInfo = getText('.cb-toss-sts');

  // Extract start time from the raw HTML
  let startTime = '';
  try {
    const rawHtml = $.html();
    const dtIdx = rawHtml.indexOf('Date &amp; Time:');
    if (dtIdx > -1) {
      const section = rawHtml.slice(dtIdx, dtIdx + 300);
      // Strip comments and tags to get plain text
      const plain = section
        .replace(/<!--.*?-->/gs, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // plain is now like: "Date & Time: Today, 7:30 PM LOCAL"
      const m = plain.match(/(Today|Tomorrow|[A-Z][a-z]+\s+\d{1,2})[\s,]*(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (m) {
        startTime = `${m[1]}, ${m[2]}`;
      } else {
        const justTime = plain.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (justTime) startTime = justTime[1];
      }
    }
  } catch (_) {}

  return {
    title,
    update: matchUpdate,
    tossInfo,
    matchDate: matchDate || '',
    startTime,
    livescore,
    runrate,
    isLive
  };
};

app.get('/score', async (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Match ID is required' });
  }
  try {
    const url = `https://www.cricbuzz.com/live-cricket-scores/${id}`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const matchData = parseCricketScore($);
    res.json(matchData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch match data. The match may not be live yet.' });
  }
});

app.get('/live-matches', async (req, res) => {
  try {
    const html = await fetchHTML('https://www.cricbuzz.com/cricket-match/live-scores');
    const $ = cheerio.load(html);

    const matches = [];
    const seen = new Set();

    $('a[href*="/live-cricket-scores/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const titleAttr = $(el).attr('title') || '';

      const idMatch = href.match(/\/live-cricket-scores\/(\d+)\//);
      if (!idMatch) return;

      const id = idMatch[1];
      if (seen.has(id)) return;
      seen.add(id);

      const parts = titleAttr.split(' - ');
      const matchName = (parts[0] || '').trim();
      const status = (parts[1] || '').trim();

      if (!matchName) return;

      const statusLower = status.toLowerCase();
      let category = 'upcoming';
      if (!status || statusLower === '') {
        category = 'live';
      } else if (
        statusLower.includes('won') ||
        statusLower.includes('complete') ||
        statusLower.includes('abandon') ||
        statusLower.includes('tie') ||
        statusLower.includes('draw')
      ) {
        category = 'completed';
      } else if (
        statusLower.includes('preview') ||
        statusLower.includes('upcoming') ||
        statusLower.includes('scheduled')
      ) {
        category = 'upcoming';
      } else {
        category = 'live';
      }

      matches.push({ id, title: matchName, status, category });
    });

    const liveMatches = matches.filter(m => m.category === 'live');

    const upcomingMatches = matches.filter(m => m.category === 'upcoming');

    const [scoredLive, timedUpcoming] = await Promise.all([
      Promise.all(
        liveMatches.slice(0, 6).map(async (match) => {
          try {
            const url = `https://www.cricbuzz.com/live-cricket-scores/${match.id}`;
            const matchHtml = await fetchHTML(url);
            const $m = cheerio.load(matchHtml);
            const scoreData = parseCricketScore($m);
            return { ...match, ...scoreData };
          } catch {
            return match;
          }
        })
      ),
      Promise.all(
        upcomingMatches.slice(0, 6).map(async (match) => {
          try {
            const url = `https://www.cricbuzz.com/live-cricket-scores/${match.id}`;
            const matchHtml = await fetchHTML(url);
            const $m = cheerio.load(matchHtml);
            const data = parseCricketScore($m);
            return { ...match, startTime: data.startTime, tossInfo: data.tossInfo };
          } catch {
            return match;
          }
        })
      )
    ]);

    const allMatchesCategorized = matches.map(m => {
      const scored = scoredLive.find(s => s.id === m.id);
      if (scored) return scored;
      const timed = timedUpcoming.find(t => t.id === m.id);
      if (timed) return timed;
      return m;
    });

    res.json({
      liveNow: scoredLive,
      allMatches: allMatchesCategorized
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch live matches' });
  }
});

const ESPN_TEAM_IDS = {
  'Afghanistan': 40,
  'Australia': 2,
  'Bangladesh': 25,
  'England': 1,
  'India': 6,
  'Ireland': 29,
  'New Zealand': 5,
  'Pakistan': 7,
  'South Africa': 3,
  'Sri Lanka': 8,
  'West Indies': 4,
  'Zimbabwe': 9,
  'Scotland': 30,
  'Netherlands': 15,
  'Nepal': 32,
  'Oman': 28,
  'USA': 11,
  'Canada': 17,
  'Kenya': 26,
  'UAE': 8,
  'Namibia': 37,
  'Papua New Guinea': 27
};

const ESPN_FORMAT_CLASS = {
  'test': 1,
  'odi': 2,
  't20': 3,
  't20i': 3
};

const FORMAT_LABEL = {
  'test': 'Test',
  'odi': 'ODI',
  't20': 'T20I',
  't20i': 'T20I'
};

const fetchH2HStats = async (teamId, oppId, formatClass) => {
  const url = `https://stats.espncricinfo.com/ci/engine/stats/index.html?class=${formatClass};filter=advanced;opposition=${oppId};team=${teamId};template=results;type=team`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  let stats = null;
  $('.engineTable').each((i, table) => {
    const text = $(table).text();
    if (text.includes('Mat') && text.includes('Won') && text.includes('Lost') && text.includes('HS')) {
      const rows = $(table).find('tr');
      rows.each((ri, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 13) {
          const mat = parseInt($(cells[2]).text().trim());
          if (!isNaN(mat) && mat > 0) {
            stats = {
              matches: mat,
              won: parseInt($(cells[3]).text().trim()) || 0,
              lost: parseInt($(cells[4]).text().trim()) || 0,
              tied: parseInt($(cells[5]).text().trim()) || 0,
              noResult: parseInt($(cells[6]).text().trim()) || 0,
              avgRunRate: parseFloat($(cells[9]).text().trim()) || 0,
              highScore: $(cells[11]).text().trim() || 'N/A',
              lowScore: $(cells[12]).text().trim() || 'N/A',
              span: $(cells[1]).text().trim() || ''
            };
          }
        }
      });
    }
  });
  return stats;
};

app.get('/h2h', async (req, res) => {
  const { team1, team2, format = 'odi' } = req.query;

  if (!team1 || !team2) {
    return res.status(400).json({ error: 'Both team1 and team2 are required' });
  }
  if (team1 === team2) {
    return res.status(400).json({ error: 'Teams must be different' });
  }

  const id1 = ESPN_TEAM_IDS[team1];
  const id2 = ESPN_TEAM_IDS[team2];

  if (!id1) return res.status(400).json({ error: `No stats available for "${team1}"` });
  if (!id2) return res.status(400).json({ error: `No stats available for "${team2}"` });

  const formatClass = ESPN_FORMAT_CLASS[format.toLowerCase()] || 2;

  try {
    const [stats1, stats2] = await Promise.all([
      fetchH2HStats(id1, id2, formatClass),
      fetchH2HStats(id2, id1, formatClass)
    ]);

    if (!stats1 && !stats2) {
      return res.status(404).json({ error: `No head-to-head ${format.toUpperCase()} data found between ${team1} and ${team2}` });
    }

    const totalMatches = stats1 ? stats1.matches : (stats2 ? stats2.matches : 0);

    res.json({
      team1: {
        name: team1,
        matches: totalMatches,
        won: stats1 ? stats1.won : 0,
        lost: stats1 ? stats1.lost : 0,
        tied: stats1 ? stats1.tied : 0,
        noResult: stats1 ? stats1.noResult : 0,
        winRate: totalMatches > 0 ? ((stats1 ? stats1.won : 0) / (totalMatches - (stats1 ? stats1.noResult : 0)) * 100).toFixed(1) : '0.0',
        avgRunRate: stats1 ? stats1.avgRunRate : 0,
        highScore: stats1 ? stats1.highScore : 'N/A',
        lowScore: stats1 ? stats1.lowScore : 'N/A',
        span: stats1 ? stats1.span : ''
      },
      team2: {
        name: team2,
        matches: totalMatches,
        won: stats2 ? stats2.won : 0,
        lost: stats2 ? stats2.lost : 0,
        tied: stats2 ? stats2.tied : 0,
        noResult: stats2 ? stats2.noResult : 0,
        winRate: totalMatches > 0 ? ((stats2 ? stats2.won : 0) / (totalMatches - (stats2 ? stats2.noResult : 0)) * 100).toFixed(1) : '0.0',
        avgRunRate: stats2 ? stats2.avgRunRate : 0,
        highScore: stats2 ? stats2.highScore : 'N/A',
        lowScore: stats2 ? stats2.lowScore : 'N/A',
        span: stats2 ? stats2.span : ''
      },
      format: FORMAT_LABEL[format.toLowerCase()] || format.toUpperCase(),
      source: 'ESPN Cricinfo Statsguru'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch head-to-head statistics. Please try again.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

app.listen(PORT, () => {
  console.log(`StatBat server running on port ${PORT}`);
});
