/**
 * functions/index.js - 最终完美版
 *
 * 核心逻辑:
 * 1. 【精准查询】代码主动请求专用的 v4/v6 查询服务，能穿透多层代理（如VPS+WARP），查到最外层的公网IP。
 * 2. 【中文显示】内置国家/地区中文名对照表，将地理位置格式化为 "国家, 城市" 的中文形式。
 * 3. 【极简输出】响应体只包含 ip 和 geo 两个关键字段，清爽干净。
 * 4. 【API纯粹性】根域名返回 404 Not Found，仅保留 ipv4/ipv6 子域名功能。
 */

// --- 配置区 ---

// CORS 头部，允许跨域请求
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 稳定、无需维护的外部IP查询服务 (这些域名分别只有 A 和 AAAA 记录，能强制协议栈)
const IP_SERVICE_CONFIG = {
  ipv4: { url: 'https://ipv4.icanhazip.com' },
  ipv6: { url: 'https://ipv6.icanhazip.com' },
};

// 常用国家/地区 ISO代码 -> 中文名 对照表 (可按需增减)
const COUNTRY_NAME_ZH = {
  "CN": "中国", "HK": "中国香港", "MO": "中国澳门", "TW": "中国台湾",
  "US": "美国", "JP": "日本", "KR": "韩国", "SG": "新加坡",
  "MY": "马来西亚", "TH": "泰国", "VN": "越南", "PH": "菲律宾",
  "GB": "英国", "FR": "法国", "DE": "德国", "RU": "俄罗斯",
  "AU": "澳大利亚", "CA": "加拿大", "IN": "印度", "ID": "印度尼西亚",
  // ... 可继续添加
};

// --- 主函数 ---

export async function onRequest(context) {
  const { request } = context;

  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const hostname = url.hostname;

  // 判断用户期望查询的IP类型
  const requestedType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');

  // 1. 如果访问根域名或其他未知域名，直接返回 404 Not Found
  if (requestedType === 'unknown') {
    return new Response('Not Found', { status: 404 });
  }

  // 2. 主动发起外部请求，查询最外层公网IP
  let clientIp = '';
  try {
    const service = IP_SERVICE_CONFIG[requestedType];
    const response = await fetch(service.url, {
      headers: { 'User-Agent': 'Cloudflare-Worker-IP-Check/3.0' }
    });
    if (!response.ok) {
      throw new Error(`External service failed with status ${response.status}`);
    }
    clientIp = (await response.text()).trim();
  } catch (error) {
    console.error(error);
    clientIp = `无法查询到您的 ${requestedType.toUpperCase()} 地址。您的网络可能不支持该协议，或查询服务暂时不可用。`;
  }

  // 3. 处理地理位置信息，转换为中文
  const countryCode = request.cf?.country || null;
  const countryName = COUNTRY_NAME_ZH[countryCode] || countryCode || '未知国家';
  const cityName = request.cf?.city || '未知城市';
  const geo = `${countryName}, ${cityName}`;

  // 4. 组合成最终的、精简的 JSON 对象
  const responsePayload = {
    ip: clientIp,
    geo: geo,
  };

  // 5. 以格式化的 JSON 形式返回
  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
