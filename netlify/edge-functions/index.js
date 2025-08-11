/**
 * src/index.js - 诊断专用版 Cloudflare Worker
 *
 * 目的: 彻底诊断为什么 resolveOverride 没有按预期工作。
 * 它会返回一个详细的 JSON 对象，包含每一步的执行状态。
 */

// 外部服务的固定 IP 地址
const IP_SERVICE_CONFIG = {
  ipv4: {
    url: 'https://ipv4.ip.sb/cdn-cgi/trace', // 使用 trace 页面获取更详细信息
    resolve: '185.178.169.21'
  },
  ipv6: {
    url: 'https://ipv6.ip.sb/cdn-cgi/trace',
    resolve: '2a0a:e540:3d::2'
  }
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    
    // 初始化诊断对象
    const debugInfo = {
      timestamp: new Date().toISOString(),
      request: {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        cf: request.cf,
      },
      logic: {
        detectedIpType: 'unknown',
        usedServiceUrl: null,
        usedResolveOverride: null,
      },
      fetchResult: {
        status: 'not_attempted',
        error: null,
        responseStatus: null,
        responseText: null,
      },
      finalOutput: null,
    };

    try {
      const ipType = hostname.startsWith('ipv4.') ? 'ipv4' : (hostname.startsWith('ipv6.') ? 'ipv6' : 'unknown');
      debugInfo.logic.detectedIpType = ipType;

      if (ipType !== 'unknown') {
        const service = IP_SERVICE_CONFIG[ipType];
        debugInfo.logic.usedServiceUrl = service.url;
        debugInfo.logic.usedResolveOverride = service.resolve;

        try {
          const response = await fetch(service.url, {
            cf: {
              // 关键的 resolveOverride
              resolveOverride: service.resolve
            }
          });
          
          debugInfo.fetchResult.status = 'success';
          debugInfo.fetchResult.responseStatus = response.status;
          const text = await response.text();
          debugInfo.fetchResult.responseText = text;
          
          // 从 trace 信息中解析 ip
          const ipLine = text.split('\n').find(line => line.startsWith('ip='));
          debugInfo.finalOutput = ipLine ? ipLine.split('=')[1] : "Could not parse IP from trace";

        } catch (e) {
          debugInfo.fetchResult.status = 'error';
          debugInfo.fetchResult.error = e.stack;
          debugInfo.finalOutput = "Fetch failed, see error.";
        }
      } else {
        debugInfo.logic.detectedIpType = 'root_domain';
        debugInfo.finalOutput = "This is the root domain. Please use ipv4.* or ipv6.* subdomain.";
      }
    } catch (e) {
        debugInfo.fetchResult.status = 'catastrophic_error';
        debugInfo.fetchResult.error = e.stack;
    }

    // 将整个诊断对象作为 JSON 返回
    return new Response(JSON.stringify(debugInfo, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },
};
