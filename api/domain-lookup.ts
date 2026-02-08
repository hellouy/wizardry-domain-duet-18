import { VercelRequest, VercelResponse } from '@vercel/node';

// ==================== 公共 WHOIS API 备用服务 ====================
const WHOIS_API_SERVICES = [
  { url: 'https://whois-nic.vercel.app/api/?domain={domain}', name: 'whois-nic' },
  { url: 'https://whois.iana.org/whois?query={domain}', name: 'iana' },
];

// ==================== 主处理函数 ====================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 处理
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const cleanDomain = domain.toLowerCase().trim();

    // 尝试公共 WHOIS API
    for (const service of WHOIS_API_SERVICES) {
      try {
        const url = service.url.replace('{domain}', cleanDomain);
        const response = await fetch(url, {
          headers: { 'User-Agent': 'DomainLookup/1.0' },
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const data = await response.json();
          
          // 转换数据格式到统一标准
          const transformedData = transformWhoisData(data, cleanDomain);
          
          return res.status(200).json({
            success: true,
            source: 'whois',
            data: transformedData
          });
        }
      } catch (error) {
        console.log(`${service.name} API failed:`, error);
        continue;
      }
    }

    // 如果所有 API 都失败，返回错误
    return res.status(503).json({
      error: 'WHOIS services temporarily unavailable',
      type: 'service_unavailable'
    });
  } catch (error: any) {
    console.error('Domain lookup error:', error);
    return res.status(500).json({
      error: error.message || 'Query failed',
      type: 'error'
    });
  }
}

// ==================== 数据转换函数 ====================
function transformWhoisData(apiData: any, domain: string): any {
  // 标准化响应数据
  const normalizedData = typeof apiData === 'string' 
    ? parseWhoisText(apiData, domain) 
    : apiData;

  return {
    domain: domain,
    registrar: normalizedData.registrar || normalizedData.Registrar || 'N/A',
    registrationDate: normalizedData.registrationDate || normalizedData['Created Date'] || normalizedData['Registered'] || 'N/A',
    expirationDate: normalizedData.expirationDate || normalizedData['Expires'] || normalizedData['Expiration Date'] || 'N/A',
    nameServers: normalizedData.nameServers || normalizedData.nameservers || [],
    status: normalizedData.status || [],
    registrant: normalizedData.registrant || {},
    dnssec: normalizedData.dnssec || false,
    lastUpdated: normalizedData.lastUpdated || normalizedData['Updated Date'] || 'N/A',
    source: 'whois'
  };
}

// ==================== 简化的 WHOIS 文本解析 ====================
function parseWhoisText(text: string, domain: string): any {
  const lines = text.split('\n');
  const result: any = {
    domain,
    registrar: null,
    registrationDate: null,
    expirationDate: null,
    nameServers: [],
    status: [],
    dnssec: false,
    lastUpdated: null,
    source: 'whois',
    registrant: {}
  };

  // 基础的注册信息提取
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('#')) continue;

    // 注册商
    if (/^registrar:\s*(.+)/i.test(trimmed)) {
      const match = trimmed.match(/^registrar:\s*(.+)/i);
      if (match && match[1]) result.registrar = match[1].trim();
    }

    // 创建日期
    if (/^(creation date|created|registered):\s*(.+)/i.test(trimmed)) {
      const match = trimmed.match(/^(?:creation date|created|registered):\s*(.+)/i);
      if (match && match[1] && !result.registrationDate) {
        result.registrationDate = formatDate(match[1].trim());
      }
    }

    // 过期日期
    if (/^(expir|expires|expiration):\s*(.+)/i.test(trimmed)) {
      const match = trimmed.match(/^(?:expir|expires|expiration)[^:]*:\s*(.+)/i);
      if (match && match[1] && !result.expirationDate) {
        result.expirationDate = formatDate(match[1].trim());
      }
    }

    // 域名服务器
    if (/^(name\s*server|ns|nameserver):\s*(.+)/i.test(trimmed)) {
      const match = trimmed.match(/^(?:name\s*server|ns|nameserver):\s*(.+)/i);
      if (match && match[1]) {
        const ns = match[1].trim().toLowerCase();
        if (ns && !result.nameServers.includes(ns)) {
          result.nameServers.push(ns);
        }
      }
    }

    // 域名状态
    if (/^domain\s*status:\s*(.+)/i.test(trimmed)) {
      const match = trimmed.match(/^domain\s*status:\s*(.+)/i);
      if (match && match[1]) {
        const status = match[1].trim();
        if (status && !result.status.includes(status)) {
          result.status.push(status);
        }
      }
    }
  }

  return result;
}

// ==================== 日期格式化 ====================
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === '-' || dateStr.toLowerCase() === 'n/a') {
    return '';
  }

  try {
    // 移除时区和其他后缀
    let cleanDate = dateStr
      .replace(/\s*\(.*?\)/g, '')
      .replace(/\s*UTC.*/i, '')
      .replace(/T/, ' ')
      .replace(/Z$/, '')
      .trim();

    const date = new Date(cleanDate);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}年${month}月${day}日`;
    }
  } catch (e) {
    console.error('Date parsing error:', e);
  }

  return dateStr;
}
