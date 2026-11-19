// PhoneTop bridge — Deno Deploy
// Tìm điện thoại trên MobileCity và đọc bảng thông số, trả JSON cho web PhoneTop.
// Endpoints: /search?q=<từ khoá>   |   /specs?url=<link máy trên mobilecity.vn>
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: CORS });
}

async function getToken() {
  const res = await fetch('https://mobilecity.vn/', { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const m = html.match(/csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('Không lấy được token từ MobileCity');
  let raw = [];
  if (res.headers.getSetCookie) raw = res.headers.getSetCookie();
  else if (res.headers.get('set-cookie')) raw = [res.headers.get('set-cookie')];
  const cookies = raw.map(c => c.split(';')[0]).filter(Boolean).join('; ');
  return { token: m[1], cookies: cookies };
}

async function searchPhones(q) {
  const t = await getToken();
  const body = new URLSearchParams({ keyword: q, _token: t.token });
  const res = await fetch('https://mobilecity.vn/ajax/search', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': t.token,
      'Referer': 'https://mobilecity.vn/',
      'Cookie': t.cookies,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const data = await res.json();
  const items = (data.data || [])
    .filter(p => p.url && p.url.indexOf('/dien-thoai/') !== -1)
    .slice(0, 10)
    .map(p => ({ name: p.name, image: p.image, url: p.url, price: p.price }));
  return { query: q, count: items.length, results: items };
}

function stripTags(s) {
  return s.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').replace(/ ·( ·)+/g, ' ·').trim();
}

async function getSpecs(pageUrl) {
  const res = await fetch(pageUrl, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const start = html.indexOf('product-info-content');
  if (start === -1) throw new Error('Không thấy bảng thông số trên trang máy này');
  const tableEnd = html.indexOf('</table>', start);
  const table = html.slice(start, tableEnd);
  const rows = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let r;
  while ((r = rowRe.exec(table)) !== null) {
    const cells = [];
    const cellRe = /<td>([\s\S]*?)<\/td>/g;
    let c;
    while ((c = cellRe.exec(r[1])) !== null) cells.push(stripTags(c[1]));
    if (cells.length >= 2 && cells[0]) rows.push({ label: cells[0].replace(/:$/, ''), value: cells[1] });
  }
  const titleM = html.match(/<title>([^<]+)<\/title>/);
  return { url: pageUrl, title: titleM ? titleM[1].split('|')[0].split(' - ')[0].trim() : '', specs: rows };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  try {
    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ error: 'Thiếu từ khoá q' }, 400);
      return json(await searchPhones(q));
    }
    if (url.pathname === '/specs') {
      const u = url.searchParams.get('url') || '';
      if (u.indexOf('https://mobilecity.vn/') !== 0) return json({ error: 'URL không hợp lệ' }, 400);
      return json(await getSpecs(u));
    }
    return json({ name: 'PhoneTop bridge', endpoints: ['/search?q=iphone 15', '/specs?url=<link máy mobilecity>'] });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
});
