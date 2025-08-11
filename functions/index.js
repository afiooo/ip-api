/**
 * functions/index.js - 最终版 Cloudflare Pages Function 代码
 *
 * 结构已更正，代码已修复，将部署在正确的目录。
 */

// 定义CORS头部，方便复用
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// 外部服务的固定 IP 地址，这是解决问题的关键
const IP_SERVICE_CONFIG = {
  ipv4: {
    url: 'https://ipv4.ip.sb',
    resolve: '185.178.169.21' // 强制通过这个IPv4地址访问
  },
  ipv6: {
    url: 'https://ipv6.ip.sb',
    resolve: '2a0a:e540:3d::2' // 强制通过这个IPv6地址访问
  }
};

export async function onRequest(context) {
  // context包含了 request, env, etc.
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const hostname = url.hostname;
  const pathname = url.pathname;

  let clientIp = '';
  // Cloudflare Pages 通过 `hostname.startsWith` 识别路由
  const ipType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

  if (ipType !== 'unknown') {
    try {
      const service = IP_SERVICE_CONFIG[ipType];
      
      const response = await fetch(service.url, {
        headers: { 'User-Agent': 'Cloudflare-Worker-IP-Check' },
        cf: {
          // 强制 fetch 通过指定 IP 连接
          resolveOverride: service.resolve
        }
      });

      if (!response.ok) throw new Error(`外部服务 ${service.url} 响应失败`);
      clientIp = (await response.text()).trim();

    } catch (error) {
      console.error(`获取外部 ${ipType} IP失败:`, error);
      clientIp = request.headers.get('cf-connecting-ip') || '查询失败';
    }
  } else {
    const rootDomain = hostname.replace(/^(www\.)/, '');
    const helpText = `欢迎使用 IP 查询 API!\n\n请使用以下地址:\n- https://ipv4.${rootDomain} (获取您的 IPv4 地址)\n- https://ipv6.${rootDomain} (获取您的 IPv6 地址)\n\n查询地理位置信息:\n- https://ipv4.${rootDomain}/geo\n- https://ipv6.${rootDomain}/geo`;
    return new Response(helpText, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (pathname.startsWith('/geo')) {
    const geoData = {
      city: request.cf?.city,
      country: request.cf?.country,
      continent: request.cf?.continent,
      latitude: request.cf?.latitude,
      longitude: request.cf?.longitude,
      timezone: request.cf?.timezone,
      colo: request.cf?.colo,
    };
    const responsePayload = { ip: clientIp, ...geoData };
    return new Response(JSON.stringify(responsePayload, null, 2), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
  }

  return new Response(clientIp, { headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
}
