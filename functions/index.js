/**
 * functions/index.js - 最终优化版
 *
 * 特点:
 * 1. 【高可用】放弃硬编码IP，改用高稳定性的专用API (icanhazip.com)，无需日后维护。
 * 2. 【使用简单】直接访问 ipv4.子域名 或 ipv6.子域名 即可获得包含IP和地理位置的完整JSON信息，无需 /geo 后缀。
 * 3. 【智能容错】当用户的网络不支持IPv6时，访问ipv6.子域名会返回清晰的提示。
 * 4. 【功能完整】保留根域名欢迎页和完整的CORS跨域支持。
 */

// --- 配置区 ---

// CORS 头部，允许跨域请求
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 稳定、无需维护的外部IP查询服务
const IP_SERVICE_CONFIG = {
  ipv4: { url: 'https://ipv4.icanhazip.com' },
  ipv6: { url: 'https://ipv6.icanhazip.com' }
};

// --- 主函数 ---

export async function onRequest(context) {
  const { request } = context;

  // 处理 OPTIONS 预检请求，用于CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const hostname = url.hostname;

  // 1. 判断用户意图：查 v4，还是 v6，还是访问根域名
  const ipType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

  // 如果访问根域名 (e.g., 4444567.xyz)
  if (ipType === 'unknown') {
    const displayDomain = hostname.replace(/^(www\.)/, '');
    const helpText = `欢迎使用 IP 及地理位置查询 API!

使用方法 (返回JSON格式数据):
- 查询您的公网 IPv4 地址及归属地:
  https://ipv4.${displayDomain}

- 查询您的公网 IPv6 地址及归属地:
  https://ipv6.${displayDomain}
`;
    return new Response(helpText, {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // 2. 如果是查询 IP (ipv4.* 或 ipv6.*)，直接返回包含地理位置的完整信息
  let clientIp = '';
  try {
    const service = IP_SERVICE_CONFIG[ipType];
    // 这个 fetch 会被 Cloudflare Worker 强制通过对应的协议栈发出
    const response = await fetch(service.url, {
        headers: {
            'User-Agent': 'Cloudflare-Worker-IP-API/2.0'
        }
    });

    if (!response.ok) {
        throw new Error(`External service ${service.url} failed with status ${response.status}`);
    }
    clientIp = (await response.text()).trim();

  } catch (error) {
    console.error(`Error fetching external ${ipType} IP:`, error);
    // 捕获到错误，很可能是因为用户的网络环境不支持。例如，在纯IPv4网络下查询IPv6地址。
    const friendlyError = (ipType === 'ipv6')
      ? '无法查询到您的 IPv6 地址。您的网络当前可能不支持 IPv6 协议。'
      : `无法查询到您的 ${ipType.toUpperCase()} 地址，请稍后重试。`;
    
    // 依然返回JSON结构，但IP字段为错误信息
    clientIp = friendlyError;
  }

  // 3. 提取 Cloudflare 提供的地理位置信息
  // 这些信息反映的是你当前连接到Cloudflare节点的网络归属地
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

  // 4. 组合成最终的 JSON 对象
  const responsePayload = {
    ip: clientIp,
    ...geoData
  };

  // 5. 以格式化的 JSON 形式返回，方便阅读
  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
