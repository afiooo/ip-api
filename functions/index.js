/**
 * functions/index.js - 终极整合版
 *
 * 功能:
 * 1. 强制协议查询：无论用户使用什么网络，都能准确查到其公网 IPv4 和 IPv6 地址。
 * 2. GEO 信息查询：在 IP 地址后附加 /geo 可查询 Cloudflare 提供的地理位置信息。
 * 3. 优雅的根域名欢迎页和 CORS 支持。
 */

// --- 配置区 ---

// CORS 头部，允许跨域请求
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// 外部 IP 查询服务配置。'resolve' 是强制 Worker 使用特定协议的关键
const IP_SERVICE_CONFIG = {
  ipv4: {
    url: 'https://ipv4.ip.sb',
    resolve: '185.178.169.21' // 强制通过 IPv4 地址去访问目标 URL
  },
  ipv6: {
    url: 'https://ipv6.ip.sb',
    resolve: '2a0a:e540:3d::2'  // 强制通过 IPv6 地址去访问目标 URL
  }
};

// --- 主函数 ---

export async function onRequest(context) {
  const { request } = context;

  // 处理 OPTIONS 预检请求，用于 CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const hostname = url.hostname;
  const pathname = url.pathname;
  
  // 1. 判断用户意图：是查 v4，还是 v6，还是访问根域名
  const ipType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

  // 如果访问根域名 (e.g., ip.4444567.xyz or 4444567.xyz)
  if (ipType === 'unknown') {
    // 兼容您之前设置的 ip.4444567.xyz 或直接用 4444567.xyz
    const displayDomain = hostname; 
    const helpText = `欢迎使用 IP 查询 API!

使用方法:
- 查询您的公网 IPv4 地址:
  https://ipv4.${displayDomain}

- 查询您的公网 IPv6 地址:
  https://ipv6.${displayDomain}

- 查询 IPv4 地址及地理位置 (JSON格式):
  https://ipv4.${displayDomain}/geo

- 查询 IPv6 地址及地理位置 (JSON格式):
  https://ipv6.${displayDomain}/geo
`;
    // 返回欢迎和帮助信息
    return new Response(helpText, {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // 2. 如果是查询 IP (ipv4.* 或 ipv6.*)
  let clientIp = '';
  try {
    const service = IP_SERVICE_CONFIG[ipType];
    const response = await fetch(service.url, {
      headers: { 'User-Agent': 'Cloudflare-Worker-IP-API' },
      cf: {
        // 这是魔法发生的地方！强制 fetch 使用指定的 IP 协议栈
        resolveOverride: service.resolve
      }
    });

    if (!response.ok) {
        // 如果外部服务挂了，就用一个明确的错误提示
        throw new Error(`External service ${service.url} failed.`);
    }
    clientIp = (await response.text()).trim();

  } catch (error) {
    console.error(`Error fetching external ${ipType} IP:`, error);
    // 如果查询失败，提供一条有用的错误信息
    clientIp = `无法查询到您的 ${ipType.toUpperCase()} 地址。您的网络可能不支持，或查询服务暂时不可用。`;
  }

  // 3. 判断是否需要返回 GEO 地理位置信息
  if (pathname.startsWith('/geo')) {
    // GEO 信息总是从 Cloudflare 的请求头中获取，它反映的是你当前连接到 CF 的信息
    const geoData = {
      city: request.cf?.city || 'N/A',
      country: request.cf?.country || 'N/A',
      continent: request.cf?.continent || 'N/A',
      latitude: request.cf?.latitude || 'N/A',
      longitude: request.cf?.longitude || 'N/A',
      timezone: request.cf?.timezone || 'N/A',
      region: request.cf?.region || 'N/A',
      colo: request.cf?.colo || 'N/A', // Cloudflare 数据中心
    };

    // 组合成最终的 JSON 对象
    const responsePayload = {
      ip: clientIp, // 这是我们费力查询到的准确 IP
      ...geoData   // 这是 Cloudflare 提供的地理信息
    };

    // 以 JSON 格式返回
    return new Response(JSON.stringify(responsePayload, null, 2), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // 4. 如果不需要 GEO 信息，直接返回纯文本的 IP 地址
  return new Response(clientIp, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
