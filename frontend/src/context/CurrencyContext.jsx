import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee",      locale: "en-IN", flag: "🇮🇳" },
  { code: "USD", symbol: "$",  name: "US Dollar",         locale: "en-US", flag: "🇺🇸" },
  { code: "EUR", symbol: "€",  name: "Euro",              locale: "de-DE", flag: "🇪🇺" },
  { code: "GBP", symbol: "£",  name: "British Pound",     locale: "en-GB", flag: "🇬🇧" },
  { code: "AED", symbol: "د.إ",name: "UAE Dirham",        locale: "ar-AE", flag: "🇦🇪" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar",  locale: "en-SG", flag: "🇸🇬" },
];

function getCurrencyInfo(code) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

function buildFormatters(code) {
  const { symbol, locale } = getCurrencyInfo(code);
  const isINR = code === "INR";

  const format = (value) => {
    const n = Number(value) || 0;
    return symbol + n.toLocaleString(locale);
  };

  const formatCompact = (value) => {
    const n = Number(value) || 0;
    if (isINR) {
      if (n >= 10000000) return `${symbol}${(n / 10000000).toFixed(1)}Cr`;
      if (n >= 100000)   return `${symbol}${(n / 100000).toFixed(1)}L`;
      if (n >= 1000)     return `${symbol}${(n / 1000).toFixed(0)}K`;
      return `${symbol}${n.toLocaleString(locale)}`;
    } else {
      if (n >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000)    return `${symbol}${(n / 1000).toFixed(0)}K`;
      return `${symbol}${n.toLocaleString(locale)}`;
    }
  };

  // For chart Y-axis tick labels (compact without full symbol for AED)
  const formatAxis = (value) => {
    const n = Number(value) || 0;
    if (isINR) {
      if (n >= 100000) return `${symbol}${(n / 100000).toFixed(0)}L`;
      if (n >= 1000)   return `${symbol}${(n / 1000).toFixed(0)}K`;
      return `${symbol}${n}`;
    } else {
      if (n >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000)    return `${symbol}${(n / 1000).toFixed(0)}K`;
      return `${symbol}${n}`;
    }
  };

  return { symbol, format, formatCompact, formatAxis };
}

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currencyCode, setCurrencyCode] = useState(
    () => localStorage.getItem("crm_currency") || "INR"
  );

  // Load from Supabase on mount
  useEffect(() => {
    supabase
      .from("crm_settings")
      .select("value")
      .eq("key", "currency")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && data.value !== currencyCode) {
          setCurrencyCode(data.value);
          localStorage.setItem("crm_currency", data.value);
        }
      });
  }, []);

  const changeCurrency = async (code) => {
    setCurrencyCode(code);
    localStorage.setItem("crm_currency", code);
    await supabase
      .from("crm_settings")
      .upsert({ key: "currency", value: code }, { onConflict: "key" });
  };

  const value = {
    currencyCode,
    currencyInfo: getCurrencyInfo(currencyCode),
    changeCurrency,
    ...buildFormatters(currencyCode),
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);
