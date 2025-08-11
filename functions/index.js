/**
 * functions/index.js - 终极正确版
 *
 * 核心逻辑:
 * 1. 唯一且最可靠的IP来源是 Cloudflare 注入的 'cf-connecting-ip' 请求头。
 * 2. 代码不再依赖任何外部 fetch 调用，杜绝了返回服务器自身IP的错误，稳定且高效。
 * 3. 根据用户访问的子域名 (ipv4/ipv6) 和其真实IP类型进行匹配，返回正确的信息或清晰的提示。
 * 4. 根域名返回 404 Not Found，仅子域名有效，满足您的最新要求。
 */

// CORS 头部，允许跨域请求
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request } = context;

  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const hostname = url.hostname;

  // 从请求头中获取最真实的用户IP
  const userIp = request.headers.get('cf-connecting-ip');

  // 判断用户期望查询的IP类型
  const requestedType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

  // 如果访问根域名或其他未知域名，直接返回 404 Not Found
  if (requestedType === 'unknown' || !userIp) {
    return new Response('Not Found', { status: 404 });
  }

  // 判断用户真实IP的类型 (简单通过 : 和 . 来区分)
  const actualIpType = userIp.includes(':') ? 'ipv6' : 'ipv4';

  let displayIp;

  // 核心判断逻辑
  if (requestedType === actualIpType) {
    // 用户的期望和实际情况一致，直接显示IP
    displayIp = userIp;
  } else {
    // 用户的期望和实际情况不符
    if (requestedType === 'ipv4') {
      displayIp = `查询失败：您当前正通过 IPv6 (${userIp}) 连接，因此无法显示您的 IPv4 地址。`;
    } else { // requestedType === 'ipv6'
      displayIp = `查询失败：您当前正通过 IPv4 (${userIp}) 连接，您的网络似乎不支持 IPv6。`;
    }
  }

  // 提取 Cloudflare 提供的地理位置信息
  const geoData = {
    city: request.cf?.city || 'N/A',
    country: request.cf?.country || 'N/A',
    continent: request.cf?.continent || 'N/A',
    latitude: request.cf?.latitude || 'N/A',
    longitude: request.cf?.longitude || 'N/A',
    timezone: request.cf?.timezone || 'N/A',
    region: request.cf?.region || 'N/A',
    colo: request.cf?.colo || 'N/A', // Cloudflare 数据中心代码
  };

  // 组合成最终的 JSON 对象
  const responsePayload = {
    ip: displayIp,
    ...geoData
  };

  // 以格式化的 JSON 形式返回
  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
