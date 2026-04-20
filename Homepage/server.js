const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 8000;

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

  let startTime = '';
  try {
    const rawHtml = $.html();
    const dtIdx = rawHtml.indexOf('Date &amp; Time:');
    if (dtIdx > -1) {
      const section = rawHtml.slice(dtIdx, dtIdx + 300);
      const plain = section
        .replace(/<!--.*?-->/gs, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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

app.get('/match-detail', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Match ID required' });

  try {
    const html = await fetchHTML(`https://www.cricbuzz.com/live-cricket-scores/${id}/`);
    const $ = cheerio.load(html);

    const rawH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const title = rawH1
      .replace(/\s*-\s*(Live Cricket Score|Commentary).*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const metaTitle = $('title').text().replace(/\s+/g, ' ').trim();

    const statusSelectors = [
      '.cb-text-complete', '.cb-text-inprogress', '.cb-text-stumps',
      '.cb-text-lunch', '.cb-text-inningsbreak', '.cb-text-tea',
      '.cb-text-rain', '.cb-text-wetoutfield', '.cb-text-delay',
      '.cb-col.cb-col-100.cb-min-stts', '.cb-min-stts',
      '.cb-col.cb-col-100.cb-font-18.cb-toss-sts'
    ];
    let update = '';
    for (const sel of statusSelectors) {
      const t = $(sel).first().text().trim();
      if (t) { update = t; break; }
    }

    const tossInfo = $('.cb-toss-sts').first().text().trim();
    const isLive = [
      '.cb-text-inprogress', '.cb-text-stumps', '.cb-text-lunch',
      '.cb-text-tea', '.cb-text-inningsbreak'
    ].some(s => $(s).first().text().trim() !== '');

    let startTime = '';
    try {
      const dtIdx = html.indexOf('Date &amp; Time:');
      if (dtIdx > -1) {
        const section = html.slice(dtIdx, dtIdx + 300)
          .replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        const m = section.match(/(Today|Tomorrow|[A-Z][a-z]+\s+\d{1,2})[\s,]*(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (m) startTime = `${m[1]}, ${m[2]}`;
      }
    } catch (_) {}

    const batters = [];
    const bowlers = [];
    let parsingBowlers = false;

    $('[class*="scorecard-bat-grid"]').each((_, el) => {
      const cells = $(el).children().map((_, c) => $(c).text().replace(/\s+/g, ' ').trim()).get();
      if (!cells.length) return;

      const first = cells[0] || '';
      if (/^Batter/i.test(first) || first === 'R') { parsingBowlers = false; return; }
      if (/^Bowler/i.test(first) || first === 'O') { parsingBowlers = true; return; }
      if (/^Key Stats/i.test(first)) return;

      if (parsingBowlers && cells.length >= 2) {
        bowlers.push({
          name: first.replace(/\s*\*\s*$/, '').trim(),
          overs: cells[1] || '', maidens: cells[2] || '',
          runs: cells[3] || '', wickets: cells[4] || '', econ: cells[5] || ''
        });
      } else if (!parsingBowlers && cells.length >= 2) {
        batters.push({
          name: first.replace(/\s*\*\s*$/, '').trim(),
          runs: cells[1] || '', balls: cells[2] || '',
          fours: cells[3] || '', sixes: cells[4] || '', sr: cells[5] || '',
          onStrike: first.includes('*')
        });
      }
    });

    const inningsScores = [];
    $('[class*="cb-font-20"]').each((_, el) => {
      const t = $(el).text().trim();
      if (t && /\d/.test(t)) inningsScores.push(t);
    });

    const effectivelyLive = isLive || batters.length > 0 || bowlers.length > 0;

    res.json({
      title,
      metaTitle,
      update,
      tossInfo,
      isLive: effectivelyLive,
      startTime,
      batters,
      bowlers,
      inningsScores
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match details' });
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
            if (!scoreData.title) {
              const h1 = $m('h1').first().text().replace(/\s+/g, ' ')
                .replace(/\s*-\s*(Live Cricket Score|Commentary).*$/i, '').trim();
              scoreData.title = h1 || match.title;
            }
            const metaScore = $m('title').text().replace(/\s+/g, ' ').trim();
            return { ...match, ...scoreData, metaScore };
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
            const metaScore = $m('title').text().replace(/\s+/g, ' ').trim();
            return { ...match, startTime: data.startTime, tossInfo: data.tossInfo, metaScore };
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

const LEAGUE_CONFIG = {
  ipl: {
    seriesId: 9241,
    slug: 'indian-premier-league-2026',
    name: 'Indian Premier League 2026',
    shortName: 'IPL 2026',
    keywords: ['ipl', 'indian premier league', 'kkr', 'mi', 'csk', 'rcb', 'srh', 'dc', 'gt', 'lsg', 'rr', 'pbks',
      'kolkata', 'mumbai', 'chennai', 'royal challengers', 'sunrisers', 'delhi', 'gujarat', 'lucknow', 'rajasthan', 'punjab']
  },
  psl: {
    seriesId: 11537,
    slug: 'pakistan-super-league-2026',
    name: 'Pakistan Super League 2026',
    shortName: 'PSL 2026',
    keywords: ['psl', 'pakistan super league', 'karachi', 'lahore', 'quetta', 'peshawar', 'multan', 'islamabad']
  },
  county1: {
    seriesId: 11408,
    slug: 'county-championship-division-one-2026',
    name: 'County Championship Division One 2026',
    shortName: 'County Div 1',
    keywords: ['county championship', 'county div 1', 'division one', 'surrey', 'kent', 'hampshire', 'lancashire', 'warwickshire', 'yorkshire', 'nottinghamshire', 'worcestershire', 'durham', 'middlesex', 'somerset']
  },
  county2: {
    seriesId: 11416,
    slug: 'county-championship-division-two-2026',
    name: 'County Championship Division Two 2026',
    shortName: 'County Div 2',
    keywords: ['county div 2', 'division two', 'gloucestershire', 'derbyshire', 'essex', 'leicestershire', 'northamptonshire', 'glamorgan', 'sussex', 'leicestershire']
  },
  bpl: {
    seriesId: 11328,
    slug: 'bangladesh-premier-league-2025-26',
    name: 'Bangladesh Premier League 2025-26',
    shortName: 'BPL 2025-26',
    keywords: ['bpl', 'bangladesh premier league', 'rangpur', 'chattogram', 'comilla', 'dhaka', 'rajshahi', 'sylhet', 'khulna', 'durdanto', 'royals', 'challengers']
  },
  npl: {
    seriesId: 11190,
    slug: 'nepal-premier-league-2025',
    name: 'Nepal Premier League 2025',
    shortName: 'NPL 2025',
    keywords: ['npl', 'nepal premier league', 'janakpur', 'pokhara', 'chitwan', 'bagmati', 'lumbini', 'sudurpaschim', 'koshi', 'gandaki']
  },
  hundredw: {
    seriesId: 11504,
    slug: 'the-hundred-womens-competition-2026',
    name: "The Hundred Women's 2026",
    shortName: "Hundred Women's",
    keywords: ["the hundred", "hundred women", "oval invincibles", "london spirit", "manchester originals", "trent rockets", "southern brave", "welsh fire", "northern superchargers", "birmingham phoenix"]
  },
  iccwt20q: {
    seriesId: 11399,
    slug: 'icc-womens-t20-world-cup-global-qualifier-2026',
    name: "ICC Women's T20 WC Qualifier 2026",
    shortName: "WT20 Qualifier",
    keywords: ['icc women', 't20 world cup qualifier', 'netherlands', 'scotland', 'thailand', 'nepal', 'zimbabwe', 'bangladesh women', 'ireland women', 'usa women', 'png women', 'namibia']
  },
  accwomen: {
    seriesId: 11452,
    slug: 'acc-womens-asia-cup-rising-stars-2026',
    name: "ACC Women's Asia Cup Rising Stars 2026",
    shortName: "ACC Women's Asia Cup",
    keywords: ['acc women', 'asia cup rising stars', 'bangladesh women', 'sri lanka women', 'thailand women', 'malaysia women', 'india women', 'pakistan women', 'uae women', 'nepal women']
  },
  iccwt20c: {
    seriesId: 12015,
    slug: 'icc-womens-t20i-challenge-trophy-2026',
    name: "ICC Women's T20I Challenge Trophy 2026",
    shortName: "WT20I Challenge",
    keywords: ['icc women challenge', 't20i challenge trophy', 'usa women', 'rwanda women', 'nepal women', 'italy women', 'vanuatu women']
  }
};

const slugToName = (slug) =>
  slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const fetchLeagueStandings = async (seriesId, slug) => {
  const url = `https://www.cricbuzz.com/cricket-series/${seriesId}/${slug}/points-table`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const teamNames = [];
  $('a[href*="/cricket-team/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/cricket-team\/([^/]+)\//);
    if (m) {
      const full = slugToName(m[1]);
      if (!teamNames.find(t => t.full === full)) {
        teamNames.push({ abbr: $(el).text().trim().replace(/\s*\([^)]+\)\s*$/, ''), full });
      }
    }
  });

  const teams = [];
  let dataRowIdx = 0;
  $('.point-table-grid').each((i, row) => {
    const cells = $(row).find('div[class*="flex"]')
      .map((_, el) => $(el).text().trim()).get().filter(t => t);
    const posNum = parseInt(cells[0]);
    if (cells.length >= 6 && i > 0 && posNum >= 1) {
      const info = teamNames[dataRowIdx] || { abbr: '?', full: 'Unknown' };
      if (info.abbr === '?') { dataRowIdx++; return; }
      teams.push({
        pos:      parseInt(cells[0]) || dataRowIdx + 1,
        abbr:     info.abbr,
        name:     info.full,
        played:   parseInt(cells[1]) || 0,
        won:      parseInt(cells[2]) || 0,
        lost:     parseInt(cells[3]) || 0,
        noResult: parseInt(cells[4]) || 0,
        pts:      parseInt(cells[5]) || 0,
        nrr:      cells[6] || '0.000'
      });
      dataRowIdx++;
    }
  });
  return teams;
};

const fetchLeagueFixtures = async (seriesId, slug) => {
  const url = `https://www.cricbuzz.com/cricket-series/${seriesId}/${slug}/matches`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const fixtures = [];
  const seen = new Set();

  $('a[href*="/live-cricket-scores/"]').each((_, el) => {
    const href  = $(el).attr('href') || '';
    const title = $(el).attr('title') || '';
    const idM   = href.match(/\/live-cricket-scores\/(\d+)\//);
    if (!idM) return;
    const id = idM[1];
    if (seen.has(id)) return;
    seen.add(id);

    const parts  = title.split(' - ');
    const name   = (parts[0] || '').trim();
    const status = (parts[1] || '').trim();
    if (!name) return;

    const sl = status.toLowerCase();
    let category = 'upcoming';
    if (!status || sl === 'live') category = 'live';
    else if (sl.includes('won') || sl.includes('complete') || sl.includes('tie') || sl.includes('draw') || sl.includes('abandon')) category = 'completed';
    else if (sl.includes('preview') || sl.includes('upcoming') || sl.includes('scheduled')) category = 'upcoming';
    else if (sl.includes('stumps') || sl.includes('inprogress') || sl.includes('lunch') || sl.includes('tea')) category = 'live';

    fixtures.push({ id, title: name, status, category });
  });

  return fixtures;
};

app.get('/leagues', async (req, res) => {
  const { league = 'ipl' } = req.query;
  const config = LEAGUE_CONFIG[league.toLowerCase()];
  if (!config) return res.status(400).json({ error: `Unknown league. Use: ${Object.keys(LEAGUE_CONFIG).join(', ')}` });

  try {
    const [standings, fixtures] = await Promise.all([
      fetchLeagueStandings(config.seriesId, config.slug),
      fetchLeagueFixtures(config.seriesId, config.slug)
    ]);

    const formMap = {};
    [...fixtures].reverse().forEach(f => {
      if (f.category !== 'completed' || !f.status) return;
      const result = f.status;
      const sl = result.toLowerCase();

      let resultType = null;
      let winner = null;
      if (/\btied\b/.test(sl)) {
        resultType = 'T';
      } else if (/\bdrawn?\b|\bdraw\b/.test(sl)) {
        resultType = 'D';
      } else if (/\babandon|\bno result|\brain/.test(sl)) {
        resultType = 'NR';
      } else {
        const winM = result.match(/^(\S+)\s+won/i);
        if (winM) { resultType = 'WIN'; winner = winM[1].toLowerCase(); }
      }
      if (!resultType) return;

      standings.forEach(team => {
        const abbr = team.abbr.toLowerCase().replace(/\s+/g, '');
        const fullWords = team.name.toLowerCase().split(/\s+/);
        const titleL = f.title.toLowerCase();
        const isInvolved = titleL.includes(abbr) || fullWords.some(w => w.length >= 4 && titleL.includes(w));
        if (!isInvolved) return;
        if (!formMap[team.abbr]) formMap[team.abbr] = [];
        if (formMap[team.abbr].length >= 6) return;

        if (resultType === 'T' || resultType === 'D' || resultType === 'NR') {
          formMap[team.abbr].push(resultType);
        } else if (resultType === 'WIN' && winner) {
          const isWinner = winner.includes(abbr) || fullWords.some(w => w.length >= 3 && winner.includes(w.slice(0, 3)));
          formMap[team.abbr].push(isWinner ? 'W' : 'L');
        }
      });
    });

    standings.forEach(t => { t.form = (formMap[t.abbr] || []).reverse(); });

    res.json({
      league: config.name,
      shortName: config.shortName,
      standings,
      fixtures: fixtures.slice(0, 30)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch league data. Please try again.' });
  }
});

const ESPN_TEAM_IDS = {
  'Afghanistan': 40, 'Australia': 2, 'Bangladesh': 25, 'England': 1,
  'India': 6, 'Ireland': 29, 'New Zealand': 5, 'Pakistan': 7,
  'South Africa': 3, 'Sri Lanka': 8, 'West Indies': 4, 'Zimbabwe': 9,
  'Scotland': 30, 'Netherlands': 15, 'Nepal': 32, 'Oman': 28,
  'USA': 11, 'Canada': 17, 'Kenya': 26, 'UAE': 8, 'Namibia': 37, 'Papua New Guinea': 27
};

const ESPN_FORMAT_CLASS = { 'test': 1, 'odi': 2, 't20': 3, 't20i': 3 };
const FORMAT_LABEL = { 'test': 'Test', 'odi': 'ODI', 't20': 'T20I', 't20i': 'T20I' };

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

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`StatBat server running on http://localhost:${PORT}`);
  console.log(`Also accessible on your network at http://127.0.0.1:${PORT}`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please kill the other process or change the PORT.`);
  } else {
    console.error(`Server error: ${e.message}`);
  }
});
