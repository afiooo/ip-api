/**
 * src/index.js - 终极修正版 Cloudflare Worker 代码
 *
 * 修复问题:
 * - 强制 Worker 使用指定的 IPv4/IPv6 出口去访问外部服务，
 *   解决 Worker 自身网络栈导致返回错误 IP 类型的问题。
 *
 * 功能说明:
 * 1. 强制分离 IPv4 / IPv6 查询:
 *    - 访问 ipv4.yourdomain.xyz -> 从外部纯IPv4服务查询并返回你的公网IPv4。
 *    - 访问 ipv6.yourdomain.xyz -> 从外部纯IPv6服务查询并返回你的公网IPv6。
 * 2. 支持 Geo 地理位置查询。
 * 3. 兼容 CORS。
 * 4. 友好提示。
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

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    let clientIp = '';
    const ipType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

    if (ipType !== 'unknown') {
      try {
        const service = IP_SERVICE_CONFIG[ipType];
        
        // 使用 resolveOverride 强制 fetch 通过指定 IP 连接
        const response = await fetch(service.url, {
          headers: { 'User-Agent': 'Cloudflare-Worker-IP-Check' }, // 添加UA避免被拦截
          cf: {
            // 这是关键中的关键！
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
        regionCode: request.cf?.regionCode,
        latitude: request.cf?.latitude,
        longitude: request.cf?.longitude,
        timezone: request.cf?.timezone,
        colo: request.cf?.colo,
      };
      const responsePayload = { ip: clientIp, ...geoData };
      return new Response(JSON.stringify(responsePayload, null, 2), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
    }

    return new Response(clientIp, { headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
