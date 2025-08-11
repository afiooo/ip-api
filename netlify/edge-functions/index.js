/**
 * src/index.js - 最终版 Cloudflare Worker 代码
 *
 * 功能说明:
 * 1. 强制分离 IPv4 / IPv6 查询:
 *    - 访问 ipv4.yourdomain.xyz -> 从外部纯IPv4服务查询并返回你的公网IPv4。
 *    - 访问 ipv6.yourdomain.xyz -> 从外部纯IPv6服务查询并返回你的公网IPv6。
 * 2. 支持 Geo 地理位置查询:
 *    - 访问 ipv4.yourdomain.xyz/geo -> 返回你的IPv4和Cloudflare提供的地理位置。
 *    - 访问 ipv6.yourdomain.xyz/geo -> 返回你的IPv6和Cloudflare提供的地理位置。
 * 3. 兼容 CORS: 允许其他网站调用你的这个API。
 * 4. 友好提示: 访问根域名时，会给出使用说明。
 */

// 定义CORS头部，方便复用
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// Cloudflare Worker 的标准入口
export default {
  async fetch(request, env, ctx) {
    // 处理 OPTIONS 预检请求 (对于CORS很重要)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    let clientIp = '';
    const ipType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

    // 1. 根据域名类型，从外部服务获取纯净的IP地址
    if (ipType !== 'unknown') {
      try {
        const targetURL = ipType === 'ipv4' ? 'https://ipv4.ip.sb' : 'https://ipv6.ip.sb';
        const response = await fetch(targetURL);
        if (!response.ok) throw new Error(`外部服务 ${targetURL} 响应失败`);
        clientIp = (await response.text()).trim();
      } catch (error) {
        console.error('获取外部IP失败:', error);
        // 如果外部服务查询失败，就使用Cloudflare的IP作为备用
        clientIp = request.headers.get('cf-connecting-ip') || '查询失败';
      }
    } else {
      // 2. 如果访问的是根域名或其他未知域名，返回帮助信息
      const rootDomain = hostname.replace(/^(www\.)/, '');
      const helpText = `欢迎使用 IP 查询 API!\n\n请使用以下地址:\n- https://ipv4.${rootDomain} (获取您的 IPv4 地址)\n- https://ipv6.${rootDomain} (获取您的 IPv6 地址)\n\n查询地理位置信息:\n- https://ipv4.${rootDomain}/geo\n- https://ipv6.${rootDomain}/geo`;
      return new Response(helpText, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/plain; charset=utf-8',
        }
      });
    }

    // 3. 处理 /geo 路径
    if (pathname.startsWith('/geo')) {
      // 从 Cloudflare 的 request.cf 对象获取地理位置信息
      const geoData = {
        city: request.cf?.city,
        country: request.cf?.country,
        continent: request.cf?.continent,
        regionCode: request.cf?.regionCode,
        latitude: request.cf?.latitude,
        longitude: request.cf?.longitude,
        timezone: request.cf?.timezone,
        colo: request.cf?.colo, // Cloudflare数据中心位置
      };

      const responsePayload = {
        ip: clientIp,
        ...geoData
      };

      return new Response(JSON.stringify(responsePayload, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        }
      });
    }

    // 4. 处理根路径，只返回IP地址
    return new Response(clientIp, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
      }
    });
  },
};
