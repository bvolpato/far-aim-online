const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const PUBLIC_DIR = path.join(__dirname, '../web/public');
const BASE_URL = 'https://faraim.online';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateDate(value, label) {
  if (value !== undefined && !ISO_DATE.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  return value;
}

function generateSitemap(dataDir = DATA_DIR, publicDir = PUBLIC_DIR) {
  console.log('Generating sitemap.xml...');

  const urls = [];
  const sourceStatus = loadJSON(path.join(dataDir, 'source-status.json'));
  const sourceDates = Object.fromEntries(
    (sourceStatus.sources || []).map(source => [
      source.id,
      validateDate(source.lastUpdated, `source ${source.id} lastUpdated`)
    ])
  );

  // Static pages
  urls.push({ loc: '/', priority: '1.0', changefreq: 'weekly' });
  urls.push({
    loc: '/far',
    lastmod: sourceDates.far,
    priority: '0.9',
    changefreq: 'weekly'
  });
  urls.push({
    loc: '/aim',
    lastmod: sourceDates.aim,
    priority: '0.9',
    changefreq: 'weekly'
  });
  urls.push({
    loc: '/glossary',
    lastmod: sourceDates.pcg,
    priority: '0.8',
    changefreq: 'monthly'
  });
  urls.push({
    loc: '/advisory-circulars',
    lastmod: sourceDates.ac,
    priority: '0.8',
    changefreq: 'monthly'
  });
  urls.push({
    loc: '/study',
    lastmod: sourceDates.study,
    priority: '0.8',
    changefreq: 'monthly'
  });
  urls.push({ loc: '/quizzes', priority: '0.8', changefreq: 'monthly' });
  urls.push({ loc: '/flashcards', priority: '0.8', changefreq: 'monthly' });
  for (const [directory, route] of [['quizzes', 'quizzes'], ['flashcards', 'flashcards']]) {
    const contentDir = path.join(dataDir, directory);
    if (!fs.existsSync(contentDir)) continue;
    fs.readdirSync(contentDir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .forEach(file => {
        const content = loadJSON(path.join(contentDir, file));
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(content.id) || `${content.id}.json` !== file) {
          throw new Error(`Invalid ${directory} route ID in ${file}`);
        }
        urls.push({
          loc: `/${route}/${content.id}`,
          lastmod: sourceDates.study,
          priority: '0.6',
          changefreq: 'monthly'
        });
      });
  }
  urls.push({ loc: '/search', priority: '0.7', changefreq: 'monthly' });
  urls.push({ loc: '/privacy', priority: '0.5', changefreq: 'yearly' });
  urls.push({ loc: '/terms', priority: '0.5', changefreq: 'yearly' });
  urls.push({ loc: '/support', priority: '0.5', changefreq: 'monthly' });

  // 1. Process FAR Parts
  const farDir = path.join(dataDir, 'far');
  if (fs.existsSync(farDir)) {
    const files = fs.readdirSync(farDir).filter(f => f.startsWith('part') && f.endsWith('.json'));
    files.forEach(file => {
      try {
        const partData = loadJSON(path.join(farDir, file));
        const partNum = partData.part;
        urls.push({
          loc: `/far/${partNum}`,
          lastmod: sourceDates.far,
          priority: '0.8',
          changefreq: 'monthly'
        });
      } catch (e) {
        console.error(`Error processing ${file}:`, e);
      }
    });
  }

  // 2. Process AIM Chapters
  const aimDir = path.join(dataDir, 'aim');
  if (fs.existsSync(aimDir)) {
    const files = fs.readdirSync(aimDir).filter(f => f.startsWith('chapter') && f.endsWith('.json'));
    files.forEach(file => {
      try {
        const chapterData = loadJSON(path.join(aimDir, file));
        const chapterNum = chapterData.chapter;
        urls.push({
          loc: `/aim/${chapterNum}`,
          lastmod: sourceDates.aim,
          priority: '0.8',
          changefreq: 'monthly'
        });
      } catch (e) {
        console.error(`Error processing ${file}:`, e);
      }
    });
  }

  // 3. Process parsed Advisory Circulars
  const advisoryCircularPath = path.join(dataDir, 'advisory-circulars', 'index.json');
  if (fs.existsSync(advisoryCircularPath)) {
    const advisoryCircularData = loadJSON(advisoryCircularPath);
    (advisoryCircularData.items || [])
      .filter(item => item.contentPath)
      .forEach(item => {
        urls.push({
          loc: `/advisory-circulars/${item.id}`,
          lastmod: validateDate(
            item.contentUpdated || sourceDates.ac,
            `Advisory Circular ${item.id} contentUpdated`
          ),
          priority: '0.7',
          changefreq: 'monthly'
        });
      });
  }

  // Generate XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  urls.forEach(url => {
    xml += '  <url>\n';
    xml += `    <loc>${BASE_URL}${url.loc}</loc>\n`;
    if (url.lastmod) {
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    }
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  const outputPath = path.join(publicDir, 'sitemap.xml');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outputPath, xml);
  console.log(`Sitemap generated with ${urls.length} URLs at ${outputPath}`);
}

if (require.main === module) {
  generateSitemap();
}

module.exports = { generateSitemap };
