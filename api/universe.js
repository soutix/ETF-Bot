'use strict';

/**
 * api/universe.js
 * Returns momentum scores, vols, and eligibility for every ETF in the universe.
 * Powers the "Universe" page in the dashboard.
 */

const alpaca   = require('../lib/alpaca');
const { annualisedVol, totalReturn, MOMENTUM_DAYS, VOL_DAYS, TOP_K, SAFE_HARBOR } = require('../lib/strategy');
const { runStrategy } = require('../lib/strategy');

const UNIVERSE = (process.env.ETF_UNIVERSE || 'SPY,QQQ,IWM,EFA,EEM,TLT,IEF,LQD,GLD,GSG,XLK,XLE,XLV,BIL')
  .split(',').map(s => s.trim()).filter(Boolean);

// ETF metadata for display purposes
const ETF_META = {
  SPY: { name: 'SPDR S&P 500',          category: 'US Equities'     },
  QQQ: { name: 'Invesco Nasdaq 100',     category: 'US Equities'     },
  IWM: { name: 'iShares Russell 2000',   category: 'US Equities'     },
  EFA: { name: 'iShares MSCI EAFE',      category: 'Intl Equities'   },
  EEM: { name: 'iShares MSCI EM',        category: 'Intl Equities'   },
  TLT: { name: 'iShares 20+ Yr Treasury',category: 'Bonds'           },
  IEF: { name: 'iShares 7-10 Yr Treasury',category:'Bonds'           },
  LQD: { name: 'iShares IG Corp Bond',   category: 'Bonds'           },
  GLD: { name: 'SPDR Gold Shares',       category: 'Commodities'     },
  GSG: { name: 'iShares Commodities',    category: 'Commodities'     },
  XLK: { name: 'Technology Select SPDR', category: 'Sector'          },
  XLE: { name: 'Energy Select SPDR',     category: 'Sector'          },
  XLV: { name: 'Health Care Select SPDR',category: 'Sector'          },
  BIL: { name: 'SPDR Bloomberg 1-3M T-Bill', category: 'Cash'        },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const HISTORY_DAYS = Math.max(200, MOMENTUM_DAYS + 30);
    const barsMap = await alpaca.getHistoricalBars(UNIVERSE, HISTORY_DAYS);

    // Get latest prices for display
    const latestBars = await alpaca.getLatestBars(UNIVERSE);

    // Run full strategy to get consistent scoring
    // Use a dummy portfolioValue — we only care about scores/weights, not dollars
    const result = runStrategy(barsMap, UNIVERSE, 100000);

    const bilPrices   = (barsMap[SAFE_HARBOR] || []).map(b => b.c);
    const bilReturn   = totalReturn(bilPrices, MOMENTUM_DAYS);

    // Build per-ETF report
    const etfs = UNIVERSE
      .filter(sym => sym !== SAFE_HARBOR)
      .map(sym => {
        const prices     = (barsMap[sym] || []).map(b => b.c);
        const momentum   = totalReturn(prices, MOMENTUM_DAYS);
        const vol        = annualisedVol(prices, VOL_DAYS);
        const latest     = latestBars[sym];
        const isEligible = result.eligible.includes(sym);
        const isSelected = result.selected.includes(sym);
        const rank       = result.eligible.indexOf(sym) + 1; // 0 if not eligible
        const meta       = ETF_META[sym] || { name: sym, category: 'Other' };

        return {
          symbol    : sym,
          name      : meta.name,
          category  : meta.category,
          price     : latest?.c || null,
          momentum  : momentum,
          vol       : vol,
          isEligible,
          isSelected,
          rank      : isEligible ? rank : null,
          targetWeight: isSelected ? result.weights[sym] : 0,
          barsCount : prices.length,
        };
      })
      .sort((a, b) => {
        // Sort: selected first, then eligible, then ineligible; within each group by momentum desc
        if (a.isSelected !== b.isSelected) return b.isSelected - a.isSelected;
        if (a.isEligible !== b.isEligible) return b.isEligible - a.isEligible;
        return (b.momentum || -Infinity) - (a.momentum || -Infinity);
      });

    return res.status(200).json({
      etfs,
      summary: {
        total    : etfs.length,
        eligible : result.eligible.length,
        selected : result.selected.length,
        inSafeHarbor: result.inSafeHarbor,
        riskFreeReturn: bilReturn,
      },
      config: {
        MOMENTUM_DAYS,
        VOL_DAYS,
        TOP_K,
        SAFE_HARBOR,
      },
    });

  } catch (err) {
    console.error('[universe]', err);
    return res.status(500).json({ error: err.message });
  }
};
