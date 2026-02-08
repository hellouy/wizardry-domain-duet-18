import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import DomainSearch from './DomainSearch';
import DomainResultCard from './DomainResultCard';
import PricingInfo from './PricingInfo';
import RecentQueries from './RecentQueries';
import { useRecentQueries } from '@/hooks/useRecentQueries';
import { useDomainPricing } from '@/hooks/useDomainPricing';

interface WhoisData {
  domain: string;
  registrar: string;
  registrationDate: string;
  expirationDate: string;
  nameServers: string[];
  status: string[];
  registrant?: {
    name?: string;
    organization?: string;
    country?: string;
    email?: string;
  };
  dnssec: boolean;
  lastUpdated: string;
  source: 'primary' | 'secondary';
}

const DomainLookup = () => {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ primary?: WhoisData; rawData?: any } | null>(null);
  const [error, setError] = useState<string>('');
  
  const { queries, addQuery, clearQueries } = useRecentQueries();
  const { pricing, loading: pricingLoading, fetchPricing, clearPricing } = useDomainPricing();

  const mergeResults = (data: any): { result: WhoisData | null; rawData: any } => {
    const primary = data.primary;
    const secondary = data.secondary;
    
    if (!primary && !secondary) return { result: null, rawData: data };
    
    const baseData = primary || secondary;
    const supplementData = primary ? secondary : primary;
    
    const result: WhoisData = {
      domain: baseData.domain,
      registrar: baseData.registrar || supplementData?.registrar || 'N/A',
      registrationDate: baseData.registrationDate || supplementData?.registrationDate || 'N/A',
      expirationDate: baseData.expirationDate || supplementData?.expirationDate || 'N/A',
      lastUpdated: baseData.lastUpdated || supplementData?.lastUpdated || 'N/A',
      nameServers: baseData.nameServers?.length ? baseData.nameServers : (supplementData?.nameServers || []),
      status: baseData.status?.length ? baseData.status : (supplementData?.status || []),
      registrant: baseData.registrant || supplementData?.registrant || {},
      dnssec: baseData.dnssec !== undefined ? baseData.dnssec : (supplementData?.dnssec || false),
      source: (baseData.source === 'rdap' ? 'primary' : 'secondary') as 'primary' | 'secondary'
    };
    
    return { result, rawData: data };
  };

  const performLookup = async (domainName: string) => {
    try {
      const response = await fetch('/api/domain-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainName, method: 'rdap' })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        let errorMsg = '查询服务暂时不可用，请稍后重试';
        if (data.error?.includes('not found')) {
          errorMsg = `域名 ${domainName} 未注册，该域名可供注册使用`;
        } else if (data.error?.includes('not available')) {
          errorMsg = `WHOIS 服务暂时不可用，请稍后重试`;
        }
        return { error: errorMsg };
      }

      if (data.source === 'rdap' || data.source === 'whois') {
        const result: WhoisData = {
          domain: domainName,
          registrar: data.data.registrar || 'N/A',
          registrationDate: data.data.registrationDate || 'N/A',
          expirationDate: data.data.expirationDate || 'N/A',
          lastUpdated: data.data.lastUpdated || 'N/A',
          nameServers: data.data.nameServers || [],
          status: data.data.status || [],
          registrant: data.data.registrant || {},
          dnssec: data.data.dnssec || false,
          source: data.source === 'rdap' ? 'primary' : 'secondary'
        };
        return { primary: result, rawData: data };
      } else {
        return { error: '未找到域名信息' };
      }
    } catch (error) {
      return { error: '网络连接错误，请检查网络后重试' };
    }
  };

  const handleLookup = async (domainToSearch?: string) => {
    const searchDomain = domainToSearch || domain;
    setError('');
    
    if (!searchDomain.trim()) {
      setError('域名不能为空，请输入要查询的域名');
      return;
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(searchDomain.trim())) {
      setError('域名格式无效，请输入有效的域名格式');
      return;
    }

    const normalizedDomain = searchDomain.trim().toLowerCase();
    setLoading(true);
    setResult(null);
    clearPricing();

    try {
      const lookupResult = await performLookup(normalizedDomain);
      setResult(lookupResult);
      
      if (lookupResult.error) {
        setError(lookupResult.error);
      } else {
        addQuery(normalizedDomain);
        // Pass whether domain is registered based on successful lookup
        fetchPricing(normalizedDomain, true);
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRecentSelect = (selectedDomain: string) => {
    setDomain(selectedDomain);
    handleLookup(selectedDomain);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Search */}
      <DomainSearch
        domain={domain}
        setDomain={setDomain}
        onSearch={() => handleLookup()}
        loading={loading}
      />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 border border-destructive/20 rounded-lg bg-destructive/5">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Pricing */}
      {(pricing || pricingLoading) && (
        <PricingInfo 
          pricing={pricing} 
          loading={pricingLoading} 
          source={result?.rawData?.primary?.source || result?.rawData?.secondary?.source || null}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Result */}
      {result?.primary && !loading && (
        <DomainResultCard data={result.primary} rawData={result.rawData} />
      )}

      {/* Recent Queries */}
      <RecentQueries
        queries={queries}
        onSelect={handleRecentSelect}
        onClear={clearQueries}
      />
    </div>
  );
};

export default DomainLookup;
